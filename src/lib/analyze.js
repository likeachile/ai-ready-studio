// Heuristic analysis: rebuilds a semantic structure from extracted PDF/PPTX pages and flags the parts an
// LLM is most likely to misread. Every issue carries (a) what the AI currently "sees" and (b) a draft
// AI-Ready rewrite that the consultant confirms or corrects on the review screen.

import { clean, isNumeric, toNumber, truncate, uid, wordCount } from './text.js';

const CAVEAT = /(\bsubject to\b|\bprovided\b|\bexcl|\bexcluding\b|\bassum|\bconditional\b|\bcap(ped)?\b|\bnot included\b|\bunless\b|\bvalid\b|\bvat\b|\bterms\b)/i;
const BULLET = /^\s*([•▪●◦‣∙·–\-*✓✔►▶>]|\d{1,2}[.)])\s+/;

// ───────────────────────── shared helpers ─────────────────────────

const fmt = (v, unit = '') => {
  const n = Number.isInteger(v) ? v.toLocaleString('en-GB') : (+v.toFixed(2)).toLocaleString('en-GB');
  return unit === '%' ? `${n}%` : unit ? `${n} ${unit}` : n;
};

const sentence = (s) => {
  const t = clean(s);
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

function mkIssue(target, category, severity, title, detail, aiReads, proposal) {
  return { id: uid('iss'), target, category, severity, title, detail, aiReads: truncate(clean(aiReads) || '(no extractable text)', 320), proposal: sentence(proposal), status: 'open', resolution: '' };
}

/** Computes a factual, quotable insight from real chart data. */
export function chartInsight(chart) {
  const { categories = [], series = [], unit = '', chartType } = chart;
  const s0 = series[0];
  if (!s0 || !s0.values.length) return '';
  const vals = s0.values.map(Number);
  const subject = chart.title || (series.length === 1 && !/^(series \d+|values?)$/i.test(s0.name) ? s0.name : '');
  const title = subject ? `${subject}: ` : '';
  if (chartType === 'pie' || chartType === 'donut') {
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    const order = vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const [top, second] = order;
    const share = (v) => `${Math.round((v / total) * 100)}%`;
    return `${title}${categories[top[1]]} is the largest share at ${share(top[0])} (${fmt(top[0], unit)})${second ? `, followed by ${categories[second[1]]} at ${share(second[0])}` : ''}. Total: ${fmt(total, unit)}.`;
  }
  if (series.length > 1) {
    const last = categories.length - 1;
    const leader = [...series].sort((a, b) => (b.values[last] ?? 0) - (a.values[last] ?? 0))[0];
    const parts = series.slice(0, 4).map((s) => `${s.name} ${fmt(s.values[0], unit)} → ${fmt(s.values[last], unit)}`);
    return `${title}compares ${series.length} series across ${categories.length} categories (${categories[0]} to ${categories[last]}). ${parts.join('; ')}. ${leader.name} leads at ${categories[last]}.`;
  }
  if (chartType === 'line' || chartType === 'area') {
    const a = vals[0];
    const b = vals[vals.length - 1];
    const pct = a ? Math.round(((b - a) / Math.abs(a)) * 100) : 0;
    const maxI = vals.indexOf(Math.max(...vals));
    return `${title}${pct >= 0 ? 'rises' : 'falls'} from ${fmt(a, unit)} (${categories[0]}) to ${fmt(b, unit)} (${categories[vals.length - 1]}), ${pct >= 0 ? '+' : ''}${pct}%, peaking at ${fmt(vals[maxI], unit)} in ${categories[maxI]}.`;
  }
  const maxI = vals.indexOf(Math.max(...vals));
  const minI = vals.indexOf(Math.min(...vals));
  const avg = vals.reduce((x, y) => x + y, 0) / vals.length;
  const vsAvg = avg ? Math.round(((vals[maxI] - avg) / avg) * 100) : 0;
  const ratio = vals[minI] ? (vals[maxI] / vals[minI]).toFixed(1) : null;
  return `${title}${categories[maxI]} is highest at ${fmt(vals[maxI], unit)} (${vsAvg}% above the average of ${fmt(+avg.toFixed(2), unit)}); ${categories[minI]} is lowest at ${fmt(vals[minI], unit)}${ratio ? ` — a ${ratio}× gap` : ''}.`;
}

function describeDiagram(nodes, diagramType, orderHint) {
  const labels = nodes.map((n) => n.label);
  const withDetail = nodes.filter((n) => n.detail);
  const details = withDetail.length ? ` Details: ${withDetail.map((n) => `${n.label} — ${n.detail}`).join('; ')}.` : '';
  if (diagramType === 'process') return `A ${labels.length}-step sequence${orderHint ? ` (${orderHint})` : ''}: ${labels.map((l, i) => `(${i + 1}) ${l}`).join(' → ')}.${details}`;
  if (diagramType === 'hierarchy') return `A hierarchy with "${labels[0]}" at the top, and below it: ${labels.slice(1).join(', ')}.${details}`;
  if (diagramType === 'cycle') return `A continuous cycle of ${labels.length} stages: ${labels.join(' → ')} → back to ${labels[0]}.${details}`;
  return `A diagram grouping ${labels.length} elements${orderHint ? ` (${orderHint})` : ''}: ${labels.join(', ')}. The relationships between these elements are expressed visually only.${details}`;
}

function tableSummary(columns, rows) {
  const body = rows.filter((r) => !/^total/i.test(r[0] || ''));
  const numericCols = columns
    .map((c, ci) => ({ c, ci, ok: body.length && body.filter((r) => isNumeric(r[ci] || '')).length >= body.length * 0.6 }))
    .filter((x) => x.ok && x.ci > 0);
  // Label column = the text column with the most distinct values (e.g. "Initiative" rather than "Wave").
  let lc = 0;
  let bestDistinct = -1;
  columns.forEach((_, ci) => {
    if (numericCols.some((n) => n.ci === ci)) return;
    const distinct = new Set(body.map((r) => r[ci]).filter(Boolean)).size;
    if (distinct > bestDistinct) [lc, bestDistinct] = [ci, distinct];
  });
  const bits = numericCols.slice(0, 2).map(({ c, ci }) => {
    let best = body[0];
    for (const r of body) if (toNumber(r[ci]) > toNumber(best[ci])) best = r;
    let lowest = body[0];
    for (const r of body) if (toNumber(r[ci]) < toNumber(lowest[ci])) lowest = r;
    return `highest ${c}: ${best[lc]} (${best[ci]}); lowest: ${lowest[lc]} (${lowest[ci]})`;
  });
  const total = rows.find((r) => /^total/i.test(r[0] || ''));
  return `Table of ${body.length} rows × ${columns.length} columns (${columns.filter(Boolean).join(', ')}).${bits.length ? ` ${bits.join('; ')}.` : ''}${total ? ` Totals: ${columns.map((c, i) => (i && total[i] ? `${c} ${total[i]}` : '')).filter(Boolean).join(', ')}.` : ''}`;
}

const draftKeyMessage = (title, facts) => {
  const f = facts
    .map((x) => clean(x).replace(/[.;:]+$/, ''))
    .filter(Boolean)
    .slice(0, 3);
  if (!f.length) return title;
  return `${title}: ${f.join('; ')}`;
};

/**
 * Process layouts often put a detail label ("Weeks 1–4") under each step. When the top row holds
 * at least three labels and most of them have something underneath, the top row becomes the steps
 * and every lower label is attached to the nearest step (by horizontal position) as its detail.
 * Items: { label, cx, top } with `top` growing downwards.
 */
function pairColumns(items, rowTolerance) {
  const rows = [];
  for (const it of [...items].sort((a, b) => a.top - b.top)) {
    const row = rows.find((r) => Math.abs(r.top - it.top) < rowTolerance);
    if (row) row.items.push(it);
    else rows.push({ top: it.top, items: [it] });
  }
  if (rows.length < 2 || rows[0].items.length < 3) return null;
  const steps = rows[0].items.sort((a, b) => a.cx - b.cx).map((h) => ({ ...h, details: [] }));
  const rest = rows.slice(1).flatMap((r) => r.items);
  if (rest.length < steps.length - 1) return null;
  for (const it of rest) steps.reduce((best, s) => (Math.abs(s.cx - it.cx) < Math.abs(best.cx - it.cx) ? s : best)).details.push(it.label);
  return steps.map((s, i) => ({ id: `n${i + 1}`, label: s.label, detail: s.details.join(' · ') }));
}

const isActionTitle = (t) => wordCount(t) >= 6;

// ───────────────────────── PDF ─────────────────────────

function groupLines(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) < Math.max(2, Math.min(l.size, it.size) * 0.45));
    if (line) {
      line.items.push(it);
      line.size = Math.max(line.size, it.size);
    } else lines.push({ y: it.y, size: it.size, items: [it] });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    const segs = [];
    for (const it of l.items) {
      const prev = segs[segs.length - 1];
      const gap = prev ? it.x - prev.x2 : Infinity;
      if (prev && gap < l.size * 1.2) {
        prev.text += (gap > l.size * 0.12 && !prev.text.endsWith(' ') ? ' ' : '') + it.str;
        prev.x2 = it.x + it.w;
      } else segs.push({ x: it.x, x2: it.x + it.w, text: it.str, size: it.size });
    }
    l.segments = segs.map((s) => ({ ...s, text: clean(s.text) })).filter((s) => s.text);
    l.text = l.segments.map((s) => s.text).join('  ');
  }
  return lines.filter((l) => l.segments.length).sort((a, b) => b.y - a.y);
}

function weightedMedianSize(items) {
  const arr = items.flatMap((i) => Array(Math.min(40, i.str.length)).fill(i.size)).sort((a, b) => a - b);
  return arr[Math.floor(arr.length / 2)] || 10;
}

function detectTables(lines) {
  const tables = [];
  const used = new Set();
  const aligned = (a, b) => b.segments.filter((s) => a.segments.some((t) => Math.abs(t.x - s.x) < 10)).length >= 2;
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i) || lines[i].segments.length < 3) continue;
    const run = [i];
    for (let j = i + 1; j < lines.length && lines[j].segments.length >= 2; j++) {
      if (!aligned(lines[run[0]], lines[j]) && !aligned(lines[run[run.length - 1]], lines[j])) break;
      run.push(j);
    }
    if (run.length < 3) continue;
    run.forEach((k) => used.add(k));
    const anchors = [];
    for (const k of run) for (const s of lines[k].segments) if (!anchors.some((a) => Math.abs(a - s.x) < 12)) anchors.push(s.x);
    anchors.sort((a, b) => a - b);
    const grid = run.map((k) => {
      const row = anchors.map(() => '');
      for (const s of lines[k].segments) {
        let best = 0;
        anchors.forEach((a, ai) => {
          if (Math.abs(a - s.x) < Math.abs(anchors[best] - s.x)) best = ai;
        });
        row[best] = clean(`${row[best]} ${s.text}`);
      }
      return row;
    });
    tables.push({ columns: grid[0], rows: grid.slice(1), lineIdx: run });
  }
  return { tables, used };
}

function analyzePdfPage(page) {
  const sectionId = uid('sec');
  const section = { id: sectionId, page: page.index, title: '', keyMessage: '', keyMessageOrigin: 'missing', blocks: [], rawText: page.rawText, thumbnail: page.thumbnail };
  const issues = [];
  const totalWords = wordCount(page.rawText);

  if (!page.items.length) {
    section.title = `Page ${page.index}`;
    const b = { id: uid('blk'), type: 'visual', description: '' };
    section.blocks.push(b);
    issues.push(
      mkIssue({ sectionId, blockId: b.id, field: 'description' }, 'visual', 'high', 'Image-only page — no machine-readable text', 'This page is rendered as an image (or scanned). An AI system will see nothing at all here.', '', `Page ${page.index} is a full-page visual with no machine-readable text; describe its content here so AI assistants can use it`),
    );
    return { section, issues };
  }

  const lines = groupLines(page.items);
  const body = weightedMedianSize(page.items);
  const topBand = page.height * 0.62;

  // Title: largest text in the upper part of the page.
  const wordy = (l) => /\p{L}{3}/u.test(l.text) && !isNumeric(l.text);
  const candidates = lines.filter((l) => l.y > topBand && l.size >= body * 1.2 && wordy(l));
  const fallback = lines.filter(wordy).slice(0, 1);
  const pool = candidates.length ? candidates : fallback.length ? fallback : lines.slice(0, 1);
  const maxSize = Math.max(...pool.map((l) => l.size));
  const titleLines = pool.filter((l) => l.size >= maxSize * 0.95).slice(0, 2);
  section.title = clean(titleLines.map((l) => l.text.replace(/\s{2,}/g, ' ')).join(' ')) || `Page ${page.index}`;
  const titleSet = new Set(titleLines);

  let rest = lines.filter((l) => !titleSet.has(l) && !/^\d{1,3}$/.test(l.text.trim()));
  const footnotes = rest.filter((l) => l.y < page.height * 0.16 && l.size <= body * 0.85);
  rest = rest.filter((l) => !footnotes.includes(l));

  const { tables, used } = detectTables(rest);
  const free = rest.filter((_, i) => !used.has(i));

  // KPIs: large numerals with a label underneath.
  const kpis = [];
  const consumed = new Set();
  for (const l of free) {
    for (const s of l.segments) {
      if (isNumeric(s.text) && s.size >= body * 1.6 && s.text.length <= 12) {
        const below = free.find((m) => m !== l && m.y < l.y && l.y - m.y < l.size * 2.4 && m.segments.some((t) => Math.abs(t.x - s.x) < 40));
        const labelSeg = below?.segments.find((t) => Math.abs(t.x - s.x) < 40);
        kpis.push({ value: s.text, label: labelSeg ? labelSeg.text : '', context: '' });
        s.used = true;
        if (labelSeg) labelSeg.used = true;
      }
    }
  }

  const segs = free.flatMap((l) => l.segments.filter((s) => !s.used).map((s) => Object.assign(s, { line: l })));
  const numbers = segs.filter((s) => isNumeric(s.text));
  const shortLabels = segs.filter((s) => !isNumeric(s.text) && wordCount(s.text) <= 4 && !/[.:;]$/.test(s.text) && !BULLET.test(s.text));
  const multiCol = free.filter((l) => l.segments.length >= 2).length;

  // Chart: several free-floating numbers on a page with vector graphics.
  let chartBlock = null;
  if ((numbers.length >= 3 && page.pathCount >= 3) || numbers.length >= 6) {
    // Category labels = short labels vertically aligned with a value (bar label above, category below).
    const cx = (s) => (s.x + s.x2) / 2;
    const labels = shortLabels.filter((s) => numbers.some((n) => Math.abs(cx(n) - cx(s)) < 45 && Math.abs(n.line.y - s.line.y) < page.height * 0.5));
    // If every value has its own aligned label, rebuild the series (layout-inferred, flagged for review).
    const nearest = numbers.map((n) => labels.filter((s) => Math.abs(cx(n) - cx(s)) < 45).sort((a, b) => Math.abs(cx(n) - cx(a)) - Math.abs(cx(n) - cx(b)))[0]);
    const inferred = nearest.every(Boolean) && new Set(nearest).size === numbers.length;
    chartBlock = {
      id: uid('blk'),
      type: 'chart',
      chartType: inferred ? 'bar' : 'detected',
      title: '',
      values: numbers.map((n) => n.text).slice(0, 24),
      labels: labels.map((s) => s.text).slice(0, 24),
      categories: inferred ? nearest.map((s) => s.text) : [],
      series: inferred ? [{ name: 'Value', values: numbers.map((n) => toNumber(n.text)) }] : [],
      unit: numbers.every((n) => n.text.includes('%')) ? '%' : '',
      inferredFromLayout: inferred,
    };
    numbers.forEach((n) => consumed.add(n));
    labels.forEach((s) => consumed.add(s));
  }

  // Diagram: many short labels scattered on a page with shapes.
  let diagramBlock = null;
  const labelPool = shortLabels.filter((s) => !consumed.has(s));
  if (labelPool.length >= 5 && (page.pathCount >= 12 || multiCol >= 3 || page.imageCount >= 3) && !(chartBlock && labelPool.length < 8)) {
    const xs = labelPool.map((s) => s.x);
    const ys = labelPool.map((s) => s.line.y);
    const horizontal = Math.max(...xs) - Math.min(...xs) > (Math.max(...ys) - Math.min(...ys)) * 1.5;
    const ordered = horizontal ? [...labelPool].sort((a, b) => a.x - b.x || b.line.y - a.line.y) : labelPool;
    const seen = new Set();
    const paired = pairColumns(
      labelPool.map((s) => ({ label: s.text, cx: (s.x + s.x2) / 2, top: -s.line.y })),
      body * 0.8,
    );
    const nodes =
      paired ||
      ordered
        .filter((s) => !seen.has(s.text.toLowerCase()) && seen.add(s.text.toLowerCase()))
        .slice(0, 12)
        .map((s, i) => ({ id: `n${i + 1}`, label: s.text, detail: '' }));
    const joined = nodes.map((n) => n.label).join(' ').toLowerCase();
    const diagramType = /\b(phase|step|stage|wave|→|then|week|month|q[1-4])\b/.test(joined) || horizontal ? 'process' : 'layout';
    diagramBlock = { id: uid('blk'), type: 'diagram', diagramType, title: '', nodes, edges: [] };
    labelPool.forEach((s) => consumed.add(s));
  }

  // Remaining text → paragraphs / bullets, keeping reading order.
  const textLines = free
    .map((l) => ({ ...l, text: clean(l.segments.filter((s) => !s.used && !consumed.has(s)).map((s) => s.text).join(' ')) }))
    .filter((l) => l.text);
  const blocks = [];
  let cur = null;
  for (const l of textLines) {
    const isBullet = BULLET.test(l.text);
    const txt = l.text.replace(BULLET, '');
    if (isBullet) {
      if (!cur || cur.type !== 'bullets') blocks.push((cur = { id: uid('blk'), type: 'bullets', items: [] }));
      cur.items.push({ text: txt, level: 0, _y: l.y, _size: l.size });
    } else if (cur && cur.type === 'bullets' && cur.items.length && Math.abs(cur.items.at(-1)._size - l.size) < 0.6 && cur.items.at(-1)._y - l.y < l.size * 1.6 && !/[.!?]$/.test(cur.items.at(-1).text)) {
      const last = cur.items.at(-1);
      last.text = clean(`${last.text} ${txt}`);
      last._y = l.y;
    } else if (cur && cur.type === 'text' && Math.abs(cur._size - l.size) < 0.6 && cur._y - l.y < l.size * 1.9) {
      cur.text = clean(`${cur.text} ${txt}`);
      cur._y = l.y;
    } else blocks.push((cur = { id: uid('blk'), type: 'text', text: txt, _y: l.y, _size: l.size }));
  }
  for (const b of blocks) {
    delete b._y;
    delete b._size;
    if (b.items) b.items.forEach((i) => (delete i._y, delete i._size));
  }

  if (kpis.length) section.blocks.push({ id: uid('blk'), type: 'kpis', items: kpis });
  section.blocks.push(...blocks);
  if (chartBlock) section.blocks.push(chartBlock);
  if (diagramBlock) section.blocks.push(diagramBlock);
  for (const t of tables) section.blocks.push({ id: uid('blk'), type: 'table', caption: '', columns: t.columns, rows: t.rows, merged: t.rows.some((r) => r.some((c) => !c)) });
  if (footnotes.length) section.blocks.push({ id: uid('blk'), type: 'text', small: true, text: clean(footnotes.map((f) => f.text).join(' ')) });

  const isCover = page.index === 1 && totalWords < 40 && !tables.length && !chartBlock;
  if (isCover) section.kind = 'cover';

  // ── Issues ──
  if (chartBlock) {
    const nums = chartBlock.values.map(toNumber);
    const maxV = chartBlock.values[nums.indexOf(Math.max(...nums.filter((n) => !Number.isNaN(n))))];
    issues.push(
      mkIssue(
        { sectionId, blockId: chartBlock.id, field: 'insight' },
        'chart',
        'high',
        'Chart values extracted without their labels',
        `${chartBlock.values.length} numeric values float on this page with no explicit link to categories. LLMs typically guess the pairing from extraction order — often wrongly.${chartBlock.inferredFromLayout ? ' Lucid paired them by alignment — please confirm.' : ''}`,
        `${chartBlock.values.join(' ')} ${chartBlock.labels.join(' ')}`,
        chartBlock.inferredFromLayout ? chartInsight(chartBlock) : `The chart shows the values ${chartBlock.values.join(', ')}; the highest is ${maxV}`,
      ),
    );
  }
  if (diagramBlock) {
    const hint = diagramBlock.diagramType === 'process' ? 'left-to-right order inferred from layout' : 'order inferred from layout';
    issues.push(
      mkIssue(
        { sectionId, blockId: diagramBlock.id, field: 'description' },
        'diagram',
        diagramBlock.nodes.length >= 6 ? 'high' : 'medium',
        diagramBlock.diagramType === 'process' ? 'Process flow: sequence and links are visual only' : 'Diagram: relationships are visual only',
        `${diagramBlock.nodes.length} short labels are arranged with shapes/arrows (${page.pathCount} vector paths). Text extraction returns them as an unordered list.`,
        diagramBlock.nodes.map((n) => n.label).join(' '),
        describeDiagram(diagramBlock.nodes, diagramBlock.diagramType, hint),
      ),
    );
  }
  for (const t of section.blocks.filter((b) => b.type === 'table')) {
    const cells = t.rows.length * t.columns.length;
    if (t.rows.length >= 5 || t.columns.length >= 5 || t.merged) {
      issues.push(
        mkIssue(
          { sectionId, blockId: t.id, field: 'summary' },
          'table',
          cells >= 30 || t.merged ? 'high' : 'medium',
          t.merged ? 'Table with empty / merged cells' : 'Dense table',
          `${t.rows.length} rows × ${t.columns.length} columns${t.merged ? ' with empty cells (likely merged in the original)' : ''}. Extracted as a flat stream, values drift between columns.`,
          [t.columns.join(' '), ...t.rows.slice(0, 3).map((r) => r.join(' '))].join(' '),
          tableSummary(t.columns, t.rows),
        ),
      );
    }
  }

  const hasVisual = !!(chartBlock || diagramBlock);
  if (isActionTitle(section.title)) {
    section.keyMessage = sentence(section.title);
    section.keyMessageOrigin = 'explicit';
  } else {
    const lead = blocks.find((b) => b.type === 'text' && wordCount(b.text) >= 10 && /[.!?]$/.test(b.text));
    if (lead && !isCover) {
      section.keyMessage = sentence(lead.text.split(/(?<=[.!?])\s/)[0]);
      section.keyMessageOrigin = 'explicit';
    } else if (!isCover) {
      const facts = [
        ...kpis.map((k) => `${k.value} ${k.label}`.trim()),
        ...blocks.flatMap((b) => (b.type === 'bullets' ? b.items.map((i) => i.text) : b.type === 'text' ? [b.text] : [])),
        ...(diagramBlock ? [diagramBlock.nodes.map((n) => n.label).slice(0, 5).join(' → ')] : []),
        ...section.blocks.filter((b) => b.type === 'table').map((b) => tableSummary(b.columns, b.rows).replace(/^Table of [^.]*\.\s*/, '')),
      ].map((f) => truncate(f, 110));
      issues.push(
        mkIssue(
          { sectionId, field: 'keyMessage' },
          'implicit',
          hasVisual ? 'high' : 'medium',
          'No explicit key message',
          `The title "${truncate(section.title, 60)}" is descriptive and no sentence states the conclusion. The "so what" is carried by the layout.`,
          `${section.title} · ${truncate(page.rawText, 160)}`,
          draftKeyMessage(section.title, facts),
        ),
      );
    }
  }

  if (multiCol / Math.max(1, free.length) > 0.35 && free.length >= 4 && !diagramBlock && !tables.length) {
    const firsts = blocks.slice(0, 4).map((b) => truncate(b.text || b.items?.[0]?.text || '', 50));
    issues.push(
      mkIssue({ sectionId, field: 'context' }, 'hierarchy', 'medium', 'Multi-column layout scrambles reading order', 'Text is laid out side by side. Extractors read across columns line by line, interleaving unrelated sentences.', truncate(free.slice(0, 3).map((l) => l.text).join(' '), 200), `Content is organised in parallel columns; read each column top to bottom: ${firsts.join(' | ')}`),
    );
  }
  if (page.imageCount >= 1 && totalWords < 25 && !isCover) {
    const b = { id: uid('blk'), type: 'visual', description: '' };
    section.blocks.push(b);
    issues.push(
      mkIssue({ sectionId, blockId: b.id, field: 'description' }, 'visual', 'high', 'Meaning carried by images', `Only ${totalWords} words on a page with ${page.imageCount} image(s). The message lives in the picture.`, page.rawText, `Visual page: ${section.title}. Visible labels: ${truncate(page.rawText, 140)}`),
    );
  } else if (page.imageCount >= 3 && shortLabels.length >= 3 && !isCover) {
    issues.push(
      mkIssue({ sectionId, field: 'context' }, 'visual', 'low', 'Icons used as visual cues', `${page.imageCount} icons/images accompany short labels. Their meaning (status, category, emphasis) is not in the text.`, shortLabels.slice(0, 8).map((s) => `[icon] ${s.text}`).join(' '), `Icons illustrate the following items: ${shortLabels.slice(0, 6).map((s) => s.text).join(', ')}`),
    );
  }
  const caveat = footnotes.map((f) => f.text).join(' ');
  if (caveat && CAVEAT.test(caveat)) {
    issues.push(
      mkIssue({ sectionId, field: 'caveats' }, 'footnote', 'high', 'Important condition hidden in a footnote', 'Small print at the bottom of the page qualifies the main content. AI answers rarely carry it through.', caveat, `Important condition: ${caveat.replace(/^\*+\s*/, '')}`),
    );
  }

  return { section, issues };
}

// ───────────────────────── PPTX ─────────────────────────

function analyzePptxSlide(slide) {
  const sectionId = uid('sec');
  const section = { id: sectionId, page: slide.index, title: '', keyMessage: '', keyMessageOrigin: 'missing', blocks: [], rawText: slide.rawText };
  const issues = [];
  const totalWords = wordCount(slide.rawText);

  const titleShape =
    slide.texts.find((t) => t.placeholder === 'title' || t.placeholder === 'ctrTitle') ||
    [...slide.texts].sort((a, b) => (b.paragraphs[0].size || 0) - (a.paragraphs[0].size || 0) || a.y - b.y)[0];
  section.title = clean(titleShape?.text.replace(/\n/g, ' ') || '') || `Slide ${slide.index}`;
  const others = slide.texts.filter((t) => t !== titleShape && !['sldNum', 'ftr', 'dt'].includes(t.placeholder));

  const footnotes = others.filter((t) => t.y > slide.height * 0.82 && (t.paragraphs[0].size || 18) <= 11);
  const diagramCandidates = others.filter((t) => !footnotes.includes(t) && !t.placeholder && wordCount(t.text) <= 8);
  const isDiagram = slide.smartArt.length || (diagramCandidates.length >= 4 && (slide.connectors >= 2 || slide.groups >= 1 || diagramCandidates.length >= 6));

  let diagramBlock = null;
  if (isDiagram) {
    let nodes;
    let diagramType;
    let hint = '';
    if (slide.smartArt.length) {
      nodes = slide.smartArt.flatMap((s) => s.nodes).slice(0, 16).map((label, i) => ({ id: `n${i + 1}`, label, detail: '' }));
      diagramType = 'layout';
      hint = 'SmartArt order';
    } else {
      const xs = diagramCandidates.map((t) => t.x);
      const ys = diagramCandidates.map((t) => t.y);
      const horizontal = Math.max(...xs) - Math.min(...xs) > (Math.max(...ys) - Math.min(...ys)) * 1.4;
      const ordered = [...diagramCandidates].sort((a, b) => (horizontal ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x));
      nodes =
        pairColumns(
          diagramCandidates.map((t) => ({ label: clean(t.text.replace(/\n/g, ' ')), cx: t.x + t.w / 2, top: t.y })),
          14,
        ) ||
        ordered.slice(0, 14).map((t, i) => ({ id: `n${i + 1}`, label: clean(t.paragraphs[0].text), detail: clean(t.paragraphs.slice(1).map((p) => p.text).join(' ')) }));
      diagramType = slide.connectors >= 2 || horizontal ? 'process' : ys.length && Math.min(...ys) < Math.max(...ys) * 0.5 ? 'hierarchy' : 'layout';
      hint = horizontal ? 'left-to-right order inferred from layout' : 'top-to-bottom order inferred from layout';
    }
    diagramBlock = { id: uid('blk'), type: 'diagram', diagramType, title: '', nodes, edges: [] };
    issues.push(
      mkIssue(
        { sectionId, blockId: diagramBlock.id, field: 'description' },
        'diagram',
        nodes.length >= 5 ? 'high' : 'medium',
        slide.smartArt.length ? 'SmartArt: structure lost on export' : diagramType === 'process' ? 'Process flow built from shapes & connectors' : 'Shape-based diagram',
        `${nodes.length} labelled shapes${slide.connectors ? `, ${slide.connectors} connectors` : ''}${slide.groups ? `, ${slide.groups} groups` : ''}. The relationships are drawn, not written.`,
        nodes.map((n) => n.label).join(' '),
        describeDiagram(nodes, diagramType, hint),
      ),
    );
  }

  const textShapes = others.filter((t) => !footnotes.includes(t) && !(isDiagram && diagramCandidates.includes(t)));
  for (const t of textShapes) {
    const bulletish = t.paragraphs.length > 1 && t.paragraphs.some((p) => p.bullet || p.level > 0);
    if (bulletish) section.blocks.push({ id: uid('blk'), type: 'bullets', items: t.paragraphs.map((p) => ({ text: p.text, level: p.level })) });
    else section.blocks.push({ id: uid('blk'), type: 'text', text: clean(t.text.replace(/\n/g, ' ')) });
  }
  if (diagramBlock) section.blocks.push(diagramBlock);

  for (const c of slide.charts) {
    const b = { id: uid('blk'), type: 'chart', ...c };
    section.blocks.push(b);
    const onSlide = slide.rawText.toLowerCase();
    const stated = c.series[0]?.values.some((v) => v && onSlide.includes(String(v)));
    issues.push(
      mkIssue(
        { sectionId, blockId: b.id, field: 'insight' },
        'chart',
        stated ? 'medium' : 'high',
        'Native chart with no written insight',
        `${c.chartType} chart with ${c.series.length} series × ${c.categories.length} categories. The data sits in embedded chart XML that most copilots ignore, and no sentence on the slide states what it shows.`,
        c.title || '(chart — no text on slide)',
        chartInsight(c),
      ),
    );
  }

  for (const t of slide.tables) {
    const [columns, ...rows] = t.rows;
    if (!columns) continue;
    const b = { id: uid('blk'), type: 'table', caption: '', columns, rows, merged: t.merged };
    section.blocks.push(b);
    if (rows.length >= 5 || columns.length >= 5 || t.merged) {
      issues.push(
        mkIssue(
          { sectionId, blockId: b.id, field: 'summary' },
          'table',
          t.merged || rows.length * columns.length >= 30 ? 'high' : 'medium',
          t.merged ? 'Merged cells break row alignment' : 'Dense table',
          `${rows.length} rows × ${columns.length} columns${t.merged ? '; merged cells leave continuation rows without their label once flattened' : ''}.`,
          t.rawRows.slice(0, 4).map((r) => r.join(' ')).join(' '),
          tableSummary(columns, rows),
        ),
      );
    }
  }

  if (footnotes.length) section.blocks.push({ id: uid('blk'), type: 'text', small: true, text: clean(footnotes.map((f) => f.text).join(' ')) });
  const isCover = slide.index === 1 && totalWords < 40 && !slide.tables.length && !slide.charts.length;
  if (isCover) section.kind = 'cover';

  if (isActionTitle(section.title)) {
    section.keyMessage = sentence(section.title);
    section.keyMessageOrigin = 'explicit';
  } else if (!isCover) {
    const facts = [
      ...slide.charts.map((c) => truncate(chartInsight(c), 110)),
      ...section.blocks.flatMap((b) => (b.type === 'bullets' ? b.items.filter((i) => !i.level).map((i) => i.text) : b.type === 'text' && !b.small ? [b.text] : [])),
      ...(diagramBlock ? [diagramBlock.nodes.slice(0, 5).map((n) => n.label).join(' → ')] : []),
      ...section.blocks.filter((b) => b.type === 'table').map((b) => tableSummary(b.columns, b.rows).replace(/^Table of [^.]*\.\s*/, '')),
    ].map((f) => truncate(f, 110));
    issues.push(
      mkIssue(
        { sectionId, field: 'keyMessage' },
        'implicit',
        diagramBlock || slide.charts.length ? 'high' : 'medium',
        'No explicit key message',
        `"${truncate(section.title, 60)}" is a topic label rather than an action title. The takeaway is left to the presenter.`,
        `${section.title} · ${truncate(slide.rawText, 160)}`,
        draftKeyMessage(section.title, facts),
      ),
    );
  }

  if (slide.pictures >= 1 && totalWords < 20 && !isCover) {
    const b = { id: uid('blk'), type: 'visual', description: '' };
    section.blocks.push(b);
    issues.push(
      mkIssue({ sectionId, blockId: b.id, field: 'description' }, 'visual', 'high', 'Meaning carried by images', `${slide.pictures} picture(s) and only ${totalWords} words.${slide.altTexts.length ? '' : ' No alt text.'}`, slide.rawText, `Visual slide: ${section.title}.${slide.altTexts.length ? ` Images: ${slide.altTexts.join('; ')}.` : ''} Visible labels: ${truncate(slide.rawText, 120)}`),
    );
  } else if (slide.pictures >= 3 && !isCover) {
    issues.push(
      mkIssue({ sectionId, field: 'context' }, 'visual', 'low', 'Icons used as visual cues', `${slide.pictures} icons/pictures${slide.altTexts.length ? '' : ' without alt text'}. Status or category conveyed by icon is invisible to AI.`, slide.altTexts.join(' ') || '(no alt text)', slide.altTexts.length ? `Icons shown: ${slide.altTexts.join(', ')}` : `The slide uses ${slide.pictures} icons to illustrate its items; they are decorative and carry no additional data`),
    );
  }

  const cols = new Set(textShapes.filter((t) => wordCount(t.text) >= 6).map((t) => Math.round(t.x / (slide.width / 6))));
  if (cols.size >= 3 && !diagramBlock) {
    issues.push(
      mkIssue({ sectionId, field: 'context' }, 'hierarchy', 'medium', 'Parallel columns without explicit structure', `${cols.size} text columns side by side. Their parallel relationship (options, pillars, comparison) is visual.`, textShapes.slice(0, 3).map((t) => t.text).join(' '), `The slide presents ${cols.size} parallel items side by side: ${textShapes.filter((t) => wordCount(t.text) >= 6).slice(0, 5).map((t) => truncate(t.paragraphs[0].text, 50)).join(' | ')}`),
    );
  }

  const caveat = footnotes.map((f) => f.text).join(' ');
  if (caveat && CAVEAT.test(caveat)) {
    issues.push(mkIssue({ sectionId, field: 'caveats' }, 'footnote', 'high', 'Important condition hidden in a footnote', 'Small print qualifies the main content of the slide.', caveat, `Important condition: ${caveat.replace(/^\*+\s*/, '')}`));
  }

  return { section, issues };
}

// ───────────────────────── entry point ─────────────────────────

export function analyzeExtraction(extracted) {
  const results = extracted.pages.map((p) => (extracted.type === 'pdf' ? analyzePdfPage(p) : analyzePptxSlide(p)));
  const sections = results.map((r) => r.section);
  const issues = results.flatMap((r) => r.issues);

  const first = extracted.pages[0]?.rawText || '';
  const client = first.match(/\b(?:[Pp]roposal|[Pp]repared|[Pp]resentation|[Rr]esponse|[Pp]roposition)\s+(?:to|for|pour|à)\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,4})/)?.[1] || '';
  const date = first.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/)?.[0] || '';
  const issuer = /\bEY\b|Ernst\s*&\s*Young/.test(extracted.pages.map((p) => p.rawText).join(' ')) ? 'EY' : extracted.author || '';
  const metaTitle = clean(extracted.title);
  const usableMeta = metaTitle && !/^(untitled|powerpoint presentation|presentation\s*\d*|microsoft .*)$/i.test(metaTitle) && !/\.\w{2,5}$/.test(metaTitle);
  const title = usableMeta ? metaTitle : sections[0]?.title || extracted.name.replace(/\.[^.]+$/, '');

  const keyMsgs = sections.filter((s) => s.kind !== 'cover' && s.keyMessage).map((s) => s.keyMessage);
  const topics = sections.filter((s) => s.kind !== 'cover').map((s) => s.title);
  const summary = `This ${sections.length}-${extracted.type === 'pdf' ? 'page' : 'slide'} document${client ? ` for ${client}` : ''} covers: ${topics.slice(0, 8).join('; ')}${topics.length > 8 ? '; …' : ''}.${keyMsgs.length ? ` Stated messages include: ${keyMsgs.slice(0, 3).join(' ')}` : ''}`;

  return {
    id: uid('doc'),
    isSample: false,
    meta: {
      title,
      subtitle: '',
      client,
      issuer,
      date,
      confidentiality: '',
      source: { name: extracted.name, type: extracted.type, size: extracted.size, pages: extracted.totalPages, analysedPages: extracted.pages.length },
    },
    summary,
    summaryOrigin: 'auto',
    sections,
    issues: issues.map((i) => ({ ...i })),
  };
}
