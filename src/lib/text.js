// Small, dependency-free text helpers shared by the analyser, exporter and simulator.

const STOPWORDS = new Set(
  `a an the and or but if of to in on for with at by from as is are was were be been being this that these those it its
  what which who whom whose how why when where do does did can could should would will shall may might must our your their
  we you they i me my us them there here than then so such not no into over under about per via vs also just only very
  any all each some more most other same own too both few many much page slide document deck proposal please tell show give`
    .split(/\s+/)
    .filter(Boolean),
);

export const uid = (prefix = 'id') => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

export const clean = (s = '') => s.replace(/\s+/g, ' ').replace(/\u0000/g, '').trim();

export const wordCount = (s = '') => (clean(s) ? clean(s).split(' ').length : 0);

const stem = (w) => w.replace(/(ings|ing|ed|es|s)$/i, '').slice(0, 12);

export function terms(s = '') {
  return clean(s.toLowerCase())
    .replace(/[^\p{L}\p{N}%€$£.\s-]/gu, ' ')
    .split(/[\s-]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

/** Relevance of `text` for a pre-tokenised question. Weighted by rarity-free term overlap. */
export function overlapScore(qTerms, text, boost = 1) {
  if (!qTerms.length) return 0;
  const bag = new Map();
  for (const t of terms(text)) bag.set(t, (bag.get(t) || 0) + 1);
  let hit = 0;
  for (const t of new Set(qTerms)) if (bag.has(t)) hit += 1 + Math.min(2, bag.get(t) - 1) * 0.25;
  return (hit / new Set(qTerms).size) * boost;
}

export const isNumeric = (s = '') => /^[\s(]*[-+]?[€$£]?\s?\d[\d.,\s]*(%|k|m|bn|x|h|hrs?|hours?|pts?|days?|wks?|weeks?|months?|yrs?|years?|fte)?[)\s]*$/i.test(s);

export const truncate = (s = '', n = 160) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export const slugify = (s = '') =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'document';

/** Deterministic pseudo-random in [0,1) from a string — keeps simulated scores stable between renders. */
export function hash01(str = '') {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function formatBytes(n = 0) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

/** Parse "€1.4m", "38%", "1,200" → number (best effort). */
export function toNumber(s = '') {
  const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return NaN;
  let v = parseFloat(m[0]);
  if (/bn/i.test(s)) v *= 1e9;
  else if (/\dm\b|m€|€m/i.test(s)) v *= 1e6;
  else if (/\dk\b/i.test(s)) v *= 1e3;
  return v;
}
