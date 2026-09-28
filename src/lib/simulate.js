// Simulated LLM for the comparison ("Battle") mode — no API calls.
//
// The "original" model only receives the flat text stream a PDF extractor produces (rawText),
// so its answers inherit the failure modes flagged during analysis. The "AI-Ready" model receives the
// resolved structured package, so its answers lead with key messages, use restated visuals and cite
// sections. Scores are deterministic and depend on retrieval strength and on review status.

import { SAMPLE_QA } from './sample.js';
import { resolveDocument, SEVERITY_WEIGHT } from './model.js';
import { clamp, hash01, overlapScore, terms, truncate } from './text.js';

const HEDGE = {
  chart: 'Several figures appear together, but the text does not say which value belongs to which category, so I may be pairing them incorrectly.',
  diagram: 'The page lists several labels, but their order and how they relate to each other are not stated in the text.',
  table: 'These values seem to come from a table; column alignment is unclear, so some numbers may be attributed to the wrong row.',
  implicit: 'The page does not state an explicit conclusion, so this is my interpretation.',
  hierarchy: 'The text fragments seem to come from different parts of the page, so the reading order may be mixed up.',
  visual: 'Part of this page appears to be visual, and I cannot see its content.',
  footnote: '',
};

export function blockText(b) {
  switch (b.type) {
    case 'text':
      return [b.text];
    case 'bullets':
      return b.items.map((i) => i.text);
    case 'cards':
      return [b.description, ...b.items.map((i) => `${i.title}: ${i.text}`)];
    case 'kpis':
      return b.items.map((k) => `${k.label}: ${k.value}${k.context ? ` (${k.context})` : ''}`);
    case 'chart':
      return [b.insight, b.series?.length ? `${b.title}: ${b.categories.map((c, i) => `${c} ${b.series.map((s) => s.values[i]).join('/')}${b.unit === '%' ? '%' : ''}`).join(', ')}` : b.values?.join(' ')];
    case 'diagram':
      return [b.description, ...b.nodes.map((n) => `${n.label}${n.detail ? ` — ${n.detail}` : ''}`)];
    case 'table':
      return [b.summary, ...b.rows.map((r) => b.columns.map((c, i) => (r[i] ? `${c}: ${r[i]}` : '')).filter(Boolean).join('; '))];
    case 'visual':
      return [b.description];
    default:
      return [];
  }
}

function sectionContext(s) {
  return [s.keyMessage && `Key message: ${s.keyMessage}`, s.context && `Reading guide: ${s.context}`, s.caveats && `Caveats: ${s.caveats}`, ...s.blocks.flatMap(blockText)].filter(Boolean);
}

function matchCurated(question, doc) {
  if (!doc.isSample) return null;
  const q = question.toLowerCase();
  const qt = terms(question);
  let best = null;
  for (const qa of SAMPLE_QA) {
    const hits = qa.keywords.filter((k) => q.includes(k)).length;
    const score = hits + overlapScore(qt, qa.q) * 2;
    if (!best || score > best.score) best = { qa, score, hits };
  }
  if (!best || best.score < 1.5) return null;
  const dismissed = best.qa.dependsOn.some((id) => doc.issues.find((i) => i.id === id)?.status === 'dismissed');
  return dismissed ? null : best.qa;
}

function rawWindows(doc) {
  const out = [];
  for (const s of doc.sections) {
    const words = (s.rawText || '').split(/\s+/).filter(Boolean);
    for (let i = 0; i < Math.max(1, words.length); i += 24) out.push({ page: s.page, sectionId: s.id, text: words.slice(i, i + 40).join(' ') });
  }
  return out;
}

export function simulate(question, doc) {
  const curated = matchCurated(question, doc);
  const resolved = resolveDocument(doc);

  if (curated) {
    const secs = curated.ready.sources.map((id) => resolved.sections.find((s) => s.id === id)).filter(Boolean);
    const rawPages = secs.map((s) => s.page);
    return {
      question,
      curated: true,
      raw: { ...curated.raw, context: doc.sections.filter((s) => rawPages.includes(s.page)).map((s) => `[p.${s.page}] ${s.rawText}`) },
      ready: {
        ...curated.ready,
        verdict: 'grounded',
        sources: secs.map((s) => ({ id: s.id, title: s.title, page: s.page })),
        context: secs.map((s) => `## ${s.title} (p.${s.page})\n${sectionContext(s).map((l) => `- ${l}`).join('\n')}`),
      },
    };
  }

  const qt = terms(question);
  const jitter = hash01(question);

  // ── Original: retrieval over flat extracted text ──
  const windows = rawWindows(doc)
    .map((w) => ({ ...w, score: overlapScore(qt, w.text) }))
    .sort((a, b) => b.score - a.score);
  const topRaw = windows[0];
  let raw;
  if (!topRaw || topRaw.score < 0.2) {
    raw = {
      text: 'I couldn’t find a clear answer to this question in the document. It may be covered in a chart or diagram that I’m unable to interpret.',
      verdict: 'miss',
      why: 'No matching text — relevant content is likely locked in visuals.',
      scores: { accuracy: Math.round(10 + jitter * 12), completeness: Math.round(5 + jitter * 8), traceability: 8 },
      context: [],
    };
  } else {
    const pageIssues = doc.issues.filter((i) => i.target.sectionId === topRaw.sectionId);
    const penalty = pageIssues.reduce((a, i) => a + SEVERITY_WEIGHT[i.severity], 0);
    const worst = [...pageIssues].sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]).find((i) => HEDGE[i.category]);
    const caveatMissed = pageIssues.some((i) => i.category === 'footnote');
    raw = {
      text: `Based on page ${topRaw.page}, the document mentions: “${truncate(topRaw.text, 230)}”.${worst ? ` ${HEDGE[worst.category]}` : ''}`,
      verdict: penalty >= 9 ? 'partial' : penalty > 0 ? 'vague' : 'ok',
      why: worst ? `${worst.title}${caveatMissed ? ' · conditions in footnote ignored' : ''}.` : 'Answer copied from raw text without interpretation.',
      scores: {
        accuracy: Math.round(clamp(34 + topRaw.score * 38 - penalty * 2.4 + jitter * 8, 6, 74)),
        completeness: Math.round(clamp(22 + topRaw.score * 30 - penalty * 1.6 + jitter * 6, 5, 62)),
        traceability: Math.round(24 + jitter * 12),
      },
      context: windows.slice(0, 2).filter((w) => w.score > 0).map((w) => `[p.${w.page}] ${w.text}`),
    };
  }

  // ── AI-Ready: retrieval over structured sections ──
  const ranked = resolved.sections
    .map((s) => {
      const ctx = sectionContext(s);
      return { s, ctx, score: overlapScore(qt, s.title, 1.5) + overlapScore(qt, s.keyMessage || '') + overlapScore(qt, ctx.join(' ')) };
    })
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  let ready;
  if (!best || best.score < 0.25) {
    ready = {
      text: `The AI-Ready package does not cover this topic explicitly. The closest section is **${best?.s.title || '—'}**${best?.s.keyMessage ? `: ${best.s.keyMessage}` : '.'}`,
      verdict: 'not-covered',
      scores: { accuracy: 72, completeness: 24, traceability: 88 },
      sources: best ? [{ id: best.s.id, title: best.s.title, page: best.s.page }] : [],
      context: [],
    };
  } else {
    const facts = best.ctx
      .filter((l) => !l.startsWith('Key message:'))
      .map((l) => ({ l, sc: overlapScore(qt, l) }))
      .filter((x) => x.sc > 0)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 3)
      .map((x) => x.l.replace(/^(Reading guide|Caveats): /, ''));
    const second = ranked[1] && ranked[1].score > best.score * 0.65 && ranked[1].s.keyMessage ? ranked[1] : null;
    const parts = [];
    if (best.s.keyMessage) parts.push(`**${best.s.keyMessage}**`);
    if (facts.length) parts.push(facts.map((f) => `- ${truncate(f, 420)}`).join('\n'));
    if (best.s.caveats && !facts.some((f) => f === best.s.caveats)) parts.push(`**Note:** ${best.s.caveats}`);
    if (second) parts.push(`Related — *${second.s.title}*: ${second.s.keyMessage}`);

    const secIssues = doc.issues.filter((i) => i.target.sectionId === best.s.id);
    const penalty = secIssues.reduce((a, i) => a + (i.status === 'open' ? 3 : i.status === 'dismissed' ? 2 : 0), 0);
    const m = Math.min(1, best.score / 1.6);
    ready = {
      verdict: 'grounded',
      text: parts.join('\n\n') || truncate(best.ctx.join(' '), 300),
      scores: {
        accuracy: Math.round(clamp(84 + m * 12 - penalty + jitter * 3, 60, 98)),
        completeness: Math.round(clamp(76 + m * 16 - penalty * 0.8 + jitter * 3, 50, 97)),
        traceability: Math.round(93 + jitter * 5),
      },
      sources: [best, second].filter(Boolean).map(({ s }) => ({ id: s.id, title: s.title, page: s.page })),
      context: [best, second].filter(Boolean).map(({ s, ctx }) => `## ${s.title} (p.${s.page})\n${ctx.map((l) => `- ${l}`).join('\n')}`),
    };
  }

  return { question, curated: false, raw, ready };
}

export function suggestedQuestions(doc) {
  if (doc.isSample) return SAMPLE_QA.map((q) => q.q);
  const qs = ['What is the main recommendation of this document?'];
  const withChart = doc.sections.find((s) => s.blocks.some((b) => b.type === 'chart'));
  const withDiagram = doc.sections.find((s) => s.blocks.some((b) => b.type === 'diagram'));
  const withTable = doc.sections.find((s) => s.blocks.some((b) => b.type === 'table'));
  const withCaveat = doc.issues.find((i) => i.category === 'footnote');
  if (withChart) qs.push(`What does the chart on “${truncate(withChart.title, 40)}” show?`);
  if (withDiagram) qs.push(`Explain the steps in “${truncate(withDiagram.title, 40)}”.`);
  if (withTable) qs.push(`Summarise the table in “${truncate(withTable.title, 40)}”.`);
  if (withCaveat) qs.push('What conditions or caveats apply?');
  qs.push(...doc.sections.filter((s) => s.kind !== 'cover').slice(0, 2).map((s) => `What is the key message of “${truncate(s.title, 40)}”?`));
  return [...new Set(qs)].slice(0, 6);
}
