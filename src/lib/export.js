// Serialises a resolved document into the AI-Ready package: hierarchical Markdown + structured JSON.

import { provenanceOf, readiness, resolveDocument } from './model.js';
import { slugify } from './text.js';

const DIAGRAM_LABEL = { process: 'Process flow', hierarchy: 'Hierarchy', cycle: 'Cycle', matrix: 'Matrix', layout: 'Diagram' };
const esc = (s = '') => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const mdTable = (cols, rows) =>
  [`| ${cols.map((c, i) => esc(c) || `Column ${i + 1}`).join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${cols.map((_, i) => esc(r[i] ?? '')).join(' | ')} |`)].join('\n');

/** Fills first-column blanks left by vertically-merged cells so each row is self-contained. */
function fillMerged(rows, merged) {
  const out = rows.map((r) => [...r]);
  if (!merged) return out;
  for (let r = 1; r < out.length; r++) {
    if (!out[r][0] && out[r - 1][0] && !/^total/i.test(out[r - 1][0])) out[r][0] = out[r - 1][0];
  }
  return out;
}

function chartRows(b) {
  return b.categories.map((cat, i) => [cat, ...b.series.map((s) => (s.values[i] ?? '') + (b.unit === '%' ? '%' : ''))]);
}

function blockToMarkdown(b) {
  const out = [];
  switch (b.type) {
    case 'text':
      out.push(b.small ? `> **Note (small print):** ${b.text}` : b.text);
      break;
    case 'bullets':
      out.push(b.items.map((i) => `${'  '.repeat(i.level || 0)}- ${i.text}`).join('\n'));
      break;
    case 'cards':
      if (b.description) out.push(`**How to read it:** ${b.description}`);
      out.push(b.items.map((i) => `- **${i.title}** — ${i.text}`).join('\n'));
      break;
    case 'kpis':
      out.push('**Key figures**', mdTable(['Metric', 'Value', 'Context'], b.items.map((k) => [k.label, k.value, k.context || ''])));
      break;
    case 'chart': {
      out.push(`### Chart — ${b.title || 'Untitled chart'}`);
      if (b.insight) out.push(`**What it shows:** ${b.insight}`);
      if (b.series?.length) out.push(`*Chart type: ${b.chartType}. Underlying data:*`, mdTable(['Category', ...b.series.map((s) => s.name)], chartRows(b)));
      else if (b.values?.length) out.push(`*Values as printed on the chart:* ${b.values.join(', ')}`);
      break;
    }
    case 'diagram': {
      out.push(`### ${DIAGRAM_LABEL[b.diagramType] || 'Diagram'} — ${b.title || 'Visual structure'}`);
      if (b.description) out.push(`**How to read it:** ${b.description}`);
      const edgeFrom = new Map((b.edges || []).map(([f, t, l]) => [f, { t, l }]));
      if (b.diagramType === 'process') {
        out.push(
          b.nodes
            .map((n, i) => {
              const e = edgeFrom.get(n.id);
              return `${i + 1}. **${n.label}**${n.detail ? ` — ${n.detail}` : ''}${e?.l ? `\n   - then: ${e.l}` : ''}`;
            })
            .join('\n'),
        );
      } else {
        out.push(b.nodes.map((n) => `- **${n.label}**${n.detail ? ` — ${n.detail}` : ''}`).join('\n'));
        const label = new Map(b.nodes.map((n) => [n.id, n.label]));
        if (b.edges?.length) out.push('**Relationships**', b.edges.map(([f, t, l]) => `- ${label.get(f)} → ${label.get(t)}${l ? ` (${l})` : ''}`).join('\n'));
      }
      break;
    }
    case 'table':
      out.push(`### Table — ${b.caption || 'Data table'}`);
      if (b.summary) out.push(`**Summary:** ${b.summary}`);
      out.push(mdTable(b.columns, fillMerged(b.rows, b.merged)));
      break;
    case 'visual':
      if (b.description) out.push(`**Visual content:** ${b.description}`);
      break;
    default:
  }
  return out.filter(Boolean).join('\n\n');
}

export function toMarkdown(doc) {
  const d = resolveDocument(doc);
  const score = readiness(doc);
  const { meta } = d;
  const content = d.sections;
  const lines = [
    '---',
    `title: "${esc(meta.title)}"`,
    meta.client && `client: "${esc(meta.client)}"`,
    meta.issuer && `issued_by: "${esc(meta.issuer)}"`,
    meta.date && `date: "${meta.date}"`,
    `source_file: "${esc(meta.source.name)}"`,
    `source_pages: ${meta.source.pages}`,
    'format: ai-ready-markdown/1.0',
    `ai_readiness_score: ${score.current}`,
    '---',
    '',
    `# ${meta.title}${meta.subtitle ? ` — ${meta.subtitle}` : ''}`,
    '',
    [meta.client && `**Client:** ${meta.client}`, meta.issuer && `**Issued by:** ${meta.issuer}`, meta.date && `**Date:** ${meta.date}`, meta.confidentiality && `**Classification:** ${meta.confidentiality}`].filter(Boolean).join(' · '),
    '',
    `> **About this file.** AI-Ready edition of “${meta.source.name}”. Visual content (charts, diagrams, tables, icons) has been restated as explicit text and every section states its key message. Page references point to the original document.`,
    '',
    '## Executive summary',
    '',
    d.summary,
    '',
    '## Key messages at a glance',
    '',
    ...content.filter((s) => s.keyMessage && s.kind !== 'cover').map((s, i) => `${i + 1}. **${s.title}** — ${s.keyMessage} *(p. ${s.page})*`),
    '',
  ].filter((l) => typeof l === 'string');

  content.forEach((s, idx) => {
    lines.push('---', '', `## ${idx + 1}. ${s.title}`, '', `*Source: page ${s.page}*`, '');
    if (s.keyMessage) lines.push(`> **Key message:** ${s.keyMessage}`, '');
    if (s.context) lines.push(`**Reading guide:** ${s.context}`, '');
    if (s.caveats) lines.push(`> ⚠️ **Conditions & caveats:** ${s.caveats}`, '');
    for (const b of s.blocks) {
      const md = blockToMarkdown(b);
      if (md) lines.push(md, '');
    }
  });

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function blockToJson(b, d, s) {
  const prov = (field) => provenanceOf(d, s.id, b.id, field);
  switch (b.type) {
    case 'text':
      return { type: b.small ? 'footnote' : 'paragraph', text: b.text };
    case 'bullets':
      return { type: 'list', items: b.items.map((i) => ({ text: i.text, level: i.level || 0 })) };
    case 'cards':
      return { type: 'card_group', description: b.description || null, description_status: b.description ? prov('description') : null, items: b.items.map(({ title, text }) => ({ title, text })) };
    case 'kpis':
      return { type: 'kpis', items: b.items.map(({ label, value, context }) => ({ label, value, context: context || null })) };
    case 'chart':
      return {
        type: 'chart',
        chart_type: b.chartType,
        title: b.title || null,
        insight: b.insight || null,
        insight_status: b.insight ? prov('insight') : null,
        unit: b.unit || null,
        categories: b.categories?.length ? b.categories : undefined,
        series: b.series?.length ? b.series : undefined,
        data_points: b.series?.length ? b.series.flatMap((ser) => b.categories.map((c, i) => ({ category: c, series: ser.name, value: ser.values[i] }))) : undefined,
        printed_values: b.values?.length ? b.values : undefined,
      };
    case 'diagram': {
      const label = new Map(b.nodes.map((n) => [n.id, n.label]));
      return {
        type: 'diagram',
        diagram_type: b.diagramType,
        title: b.title || null,
        description: b.description || null,
        description_status: b.description ? prov('description') : null,
        nodes: b.nodes.map((n, i) => ({ id: n.id, order: i + 1, label: n.label, detail: n.detail || null })),
        relationships: (b.edges || []).map(([f, t, l]) => ({ from: label.get(f), to: label.get(t), type: l || null })),
      };
    }
    case 'table': {
      const rows = fillMerged(b.rows, b.merged);
      const keys = b.columns.map((c, i) => c || `column_${i + 1}`);
      return {
        type: 'table',
        caption: b.caption || null,
        summary: b.summary || null,
        summary_status: b.summary ? prov('summary') : null,
        columns: keys,
        records: rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? '']))),
        had_merged_cells: !!b.merged,
      };
    }
    case 'visual':
      return { type: 'visual', description: b.description || null, description_status: b.description ? prov('description') : null };
    default:
      return { type: b.type };
  }
}

export function toJSON(doc) {
  const d = resolveDocument(doc);
  const score = readiness(doc);
  const { meta } = d;
  const payload = {
    schema: 'ai-ready-proposal/1.0',
    generated_at: new Date().toISOString(),
    generator: 'Lucid AI-Ready Studio (POC)',
    source: { file: meta.source.name, format: meta.source.type, pages: meta.source.pages },
    document: {
      title: meta.title,
      subtitle: meta.subtitle || null,
      client: meta.client || null,
      issuer: meta.issuer || null,
      date: meta.date || null,
      classification: meta.confidentiality || null,
      executive_summary: d.summary,
    },
    reading_instructions:
      'Each section maps to one page of the original document. Prefer `key_message` for conclusions, `insight`/`description`/`summary` fields for visual content, and `caveats` for conditions. Cite `source_page` when answering.',
    key_messages: d.sections.filter((s) => s.keyMessage && s.kind !== 'cover').map((s) => ({ section_id: s.id, source_page: s.page, title: s.title, message: s.keyMessage })),
    sections: d.sections.map((s, i) => ({
      id: s.id,
      order: i + 1,
      source_page: s.page,
      kind: s.kind || 'content',
      title: s.title,
      key_message: s.keyMessage || null,
      key_message_status: s.keyMessage ? (s.keyMessageOrigin === 'user' ? 'author' : s.keyMessageOrigin === 'explicit' ? 'source' : provenanceOf(d, s.id, null, 'keyMessage')) : null,
      reading_guide: s.context || null,
      caveats: s.caveats || null,
      content: s.blocks.map((b) => blockToJson(b, d, s)).filter((b) => !(b.type === 'visual' && !b.description)),
    })),
    quality: {
      ai_readiness_score: score.current,
      original_score: score.original,
      issues_detected: score.total,
      issues_reviewed: score.reviewed,
      issues_auto_drafted: score.open,
      by_issue: doc.issues.map((i) => ({ id: i.id, section_id: i.target.sectionId, category: i.category, severity: i.severity, title: i.title, status: i.status })),
    },
  };
  return JSON.stringify(payload, null, 2);
}

export const packageBaseName = (doc) => `${slugify(doc.meta.title)}-ai-ready`;

export function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function buildZip(doc) {
  const { default: JSZip } = await import('jszip');
  const base = packageBaseName(doc);
  const score = readiness(doc);
  const zip = new JSZip();
  const folder = zip.folder(base);
  folder.file(`${base}.md`, toMarkdown(doc));
  folder.file(`${base}.json`, toJSON(doc));
  folder.file(
    'README.md',
    `# AI-Ready package — ${doc.meta.title}

Generated from **${doc.meta.source.name}** with Lucid AI-Ready Studio.

| | |
|---|---|
| AI-readiness score | ${score.original} → **${score.current}** / 100 |
| Issues detected | ${score.total} (${score.reviewed} reviewed by author, ${score.open} auto-drafted) |

## Files
- \`${base}.md\` — upload next to (or instead of) the PDF in Microsoft Copilot, ChatGPT/custom GPTs or any chat assistant.
- \`${base}.json\` — structured version for agents, RAG pipelines and Copilot Studio knowledge sources. Each section keeps its \`source_page\`.

## Suggested instruction for a custom assistant
> When answering questions about this proposal, rely on the section \`key_message\` fields for conclusions, on \`insight\`, \`description\` and \`summary\` fields for charts, diagrams and tables, and always mention \`caveats\`. Cite the source page.
`,
  );
  return zip.generateAsync({ type: 'blob' });
}
