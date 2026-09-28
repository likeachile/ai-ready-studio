import { useEffect, useRef, useState } from 'react';
import { scoreTone } from '../lib/model.js';

// Stroke icon set (24×24, Fluent-like weight).
const PATHS = {
  upload: 'M12 16V4m0 0 4.5 4.5M12 4 7.5 8.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5',
  chart: 'M4 20h16M7 16v-5m5 5V7m5 9v-8',
  flow: 'M3 7h5l2 3-2 3H3l2-3-2-3Zm8 0h5l2 3-2 3h-5l2-3-2-3Zm8 3h2',
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  spark: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5a1.5 1.5 0 1 0 0-.01',
  note: 'M5 4h14v11l-5 5H5zM14 20v-5h5M8 9h8M8 12h5',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6 6 18',
  arrow: 'M5 12h14m0 0-5-5m5 5-5 5',
  back: 'M19 12H5m0 0 5-5m-5 5 5 5',
  download: 'M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  braces: 'M8 4H7a2 2 0 0 0-2 2v3.5L3.5 12 5 14.5V18a2 2 0 0 0 2 2h1m8-16h1a2 2 0 0 1 2 2v3.5l1.5 2.5-1.5 2.5V18a2 2 0 0 1-2 2h-1',
  markdown: 'M3 6h18v12H3zM6.5 15V9l2.5 3 2.5-3v6m5-6v6m0 0-2-2m2 2 2-2',
  sparkles: 'M10 3.5 11.6 8 16 9.5l-4.4 1.6L10 15.5l-1.6-4.4L4 9.5 8.4 8 10 3.5ZM17.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z',
  battle: 'M4 4l7 7M4 4v4m0-4h4m12 16-7-7m7 7v-4m0 4h-4M20 4l-9.5 9.5M20 4v4m0-4h-4M4 20l3.5-3.5M7 14l3 3',
  send: 'M5 12 20 4l-4 16-4.5-6.5L5 12Zm6.5 1.5L20 4',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  chevron: 'm9 6 6 6-6 6',
  chevronDown: 'm6 9 6 6 6-6',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5v-5m0-3h.01',
  doc: 'M6 3h9l4 4v14H6zM9 11h7M9 14h7M9 17h4',
  zip: 'M6 3h12v18H6zM11 3v2h2v2h-2v2h2v2h-2m0 3h2v3h-2z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  shield: 'M12 3 4.5 6v5.5c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6L12 3Zm-3 9 2 2 4-4',
  cpu: 'M8 8h8v8H8zM5 5h14v14H5zM9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3',
  bolt: 'M13 3 5 13.5h6.5L10 21l8-10.5h-6.5L13 3Z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0-4.5h.01',
  plus: 'M12 5v14M5 12h14',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
};

export function Icon({ name, size = 18, stroke = 1.7, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      <path d={PATHS[name] || PATHS.info} />
    </svg>
  );
}

export function PrismMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="pm" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#FFE600" />
          <stop offset="1" stopColor="#3EE0A1" />
        </linearGradient>
      </defs>
      <path d="M6 25 16 6l10 19Z" fill="none" stroke="#FFE600" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M2 17h9" stroke="#8a8f9c" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M20 14.5 30 11M20.5 17 30 17M20 19.5 30 23" stroke="url(#pm)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const TONE_COLOR = { ready: 'var(--ready)', warn: 'var(--warn)', raw: 'var(--raw)' };

export function ScoreRing({ value, size = 52, stroke = 5, tone, large, label }) {
  const shown = useCountUp(value);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = TONE_COLOR[tone || scoreTone(value)];
  return (
    <div className={`ring${large ? ' lg' : ''}`} style={{ width: size, height: size }} title={label}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
      </svg>
      <span className="ring-val" style={{ color }}>
        {shown}
      </span>
    </div>
  );
}

export function useCountUp(target, duration = 900) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(a + (target - a) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, duration]);
  return v;
}

// Minimal, safe markdown for answers: **bold**, *italic*, "- " / "1. " lists, paragraphs.
function inline(text, keyBase) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((p, i) =>
    p.startsWith('**') ? <strong key={`${keyBase}-${i}`}>{p.slice(2, -2)}</strong> : p.startsWith('*') && p.length > 2 ? <em key={`${keyBase}-${i}`}>{p.slice(1, -1)}</em> : <span key={`${keyBase}-${i}`}>{p}</span>,
  );
}

export const renderInline = inline;

export function RichText({ text = '', caret = false }) {
  // Group lines into paragraphs, bullet lists and numbered lists.
  const groups = [];
  for (const line of text.split('\n')) {
    const type = /^\s*-\s/.test(line) ? 'ul' : /^\s*\d+\.\s/.test(line) ? 'ol' : line.trim() ? 'p' : 'gap';
    const last = groups[groups.length - 1];
    if (type === 'gap') groups.push({ type: 'gap', lines: [] });
    else if (last && last.type === type) last.lines.push(line);
    else groups.push({ type, lines: [line] });
  }
  const visible = groups.filter((g) => g.type !== 'gap');
  const lastGroup = visible[visible.length - 1];
  const Caret = ({ on }) => (caret && on ? <span className="caret" /> : null);
  return (
    <>
      {visible.map((g, gi) => {
        const isLast = g === lastGroup;
        if (g.type === 'p')
          return (
            <p key={gi}>
              {g.lines.map((l, li) => (
                <span key={li}>
                  {li > 0 && <br />}
                  {inline(l, `${gi}-${li}`)}
                </span>
              ))}
              <Caret on={isLast} />
            </p>
          );
        const Tag = g.type;
        return (
          <Tag key={gi}>
            {g.lines.map((l, li) => (
              <li key={li}>
                {inline(l.replace(/^\s*(-|\d+\.)\s/, ''), `${gi}-${li}`)}
                <Caret on={isLast && li === g.lines.length - 1} />
              </li>
            ))}
          </Tag>
        );
      })}
    </>
  );
}

export function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="toast" role="status">
      <Icon name="check" size={16} style={{ color: 'var(--ready)' }} />
      {message}
    </div>
  );
}
