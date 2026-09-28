// The AI-Ready document model and the logic that applies review decisions to it.
//
// A document is { meta, summary, sections[], issues[] }.
// Each issue points at a field (`target`) of a section or block. The review screen never mutates
// the document directly for issues: `resolveDocument` derives the final content from issue statuses,
// so a user can change their mind at any time and exports always reflect the latest decisions.

export const SEVERITY_WEIGHT = { high: 9, medium: 5, low: 2 };

export const CATEGORY = {
  chart: { label: 'Chart without stated insight', short: 'Chart', icon: 'chart' },
  diagram: { label: 'Diagram / process flow', short: 'Diagram', icon: 'flow' },
  table: { label: 'Dense or merged table', short: 'Table', icon: 'table' },
  implicit: { label: 'Implicit key message', short: 'Key message', icon: 'spark' },
  hierarchy: { label: 'Layout-driven hierarchy', short: 'Hierarchy', icon: 'layers' },
  visual: { label: 'Icons & visual-only meaning', short: 'Visual', icon: 'image' },
  footnote: { label: 'Critical caveat in footnote', short: 'Footnote', icon: 'note' },
};

export const STATUS = {
  open: { label: 'To review', tone: 'warn' },
  accepted: { label: 'Accepted', tone: 'ready' },
  edited: { label: 'Rewritten', tone: 'ready' },
  dismissed: { label: 'Dismissed', tone: 'muted' },
};

/** Value an issue contributes to the final package, and how trustworthy it is. */
export function issueValue(issue) {
  if (issue.status === 'accepted') return { value: issue.proposal, provenance: 'reviewed' };
  if (issue.status === 'edited') return { value: issue.resolution, provenance: 'author' };
  if (issue.status === 'dismissed') return { value: null, provenance: 'dismissed' };
  return { value: issue.proposal, provenance: 'auto-draft' };
}

/** Returns a deep-copied document where every issue decision has been applied to its target field. */
export function resolveDocument(doc) {
  const out = structuredClone(doc);
  const sections = new Map(out.sections.map((s) => [s.id, s]));
  out.provenance = {};
  for (const issue of doc.issues) {
    const { value, provenance } = issueValue(issue);
    const section = sections.get(issue.target.sectionId);
    if (!section) continue;
    const holder = issue.target.blockId ? section.blocks.find((b) => b.id === issue.target.blockId) : section;
    if (!holder) continue;
    const key = `${issue.target.sectionId}/${issue.target.blockId || ''}/${issue.target.field}`;
    if (value == null) continue; // dismissed → keep whatever the source already said
    // A user-typed key message on the section wins over an issue draft.
    if (issue.target.field === 'keyMessage' && section.keyMessageOrigin === 'user') continue;
    holder[issue.target.field] = value;
    out.provenance[key] = provenance;
  }
  return out;
}

export function provenanceOf(resolved, sectionId, blockId, field) {
  return resolved.provenance?.[`${sectionId}/${blockId || ''}/${field}`] || 'source';
}

/**
 * AI-readability score (0–100). The "original" score reflects how much meaning is locked in
 * visuals; the current score credits each issue as it is reviewed (auto drafts get partial credit).
 */
export function readiness(doc) {
  const issues = doc.issues || [];
  const total = issues.reduce((a, i) => a + SEVERITY_WEIGHT[i.severity], 0);
  const sections = Math.max(1, doc.sections.length);
  const density = total / sections; // penalty per slide
  const original = Math.round(Math.max(14, Math.min(82, 88 - density * 5.2)));
  if (!total) return { original, current: 94, reviewed: 0, total: 0, open: 0 };
  let credit = 0;
  let reviewed = 0;
  for (const i of issues) {
    const w = SEVERITY_WEIGHT[i.severity];
    if (i.status === 'open') credit += w * 0.55;
    else {
      credit += w;
      reviewed += 1;
    }
  }
  const ceiling = 96;
  // "current" = what you'd get exporting right now (auto drafts included).
  const current = Math.round(original + (ceiling - original) * (credit / total));
  return { original, current, reviewed, total: issues.length, open: issues.length - reviewed };
}

export function scoreTone(v) {
  if (v >= 80) return 'ready';
  if (v >= 55) return 'warn';
  return 'raw';
}
