import SlidePreview from './SlidePreview.jsx';
import { Icon, useCountUp } from './ui.jsx';

export const PROC_STEPS = [
  { title: 'Reading document layers', sub: 'Text runs, fonts, positions, images' },
  { title: 'Detecting visual structures', sub: 'Charts, diagrams, tables, icons' },
  { title: 'Reconstructing hierarchy', sub: 'Titles, reading order, key messages' },
  { title: 'Scoring AI-readability', sub: 'Where an LLM is likely to misread' },
  { title: 'Drafting AI-Ready rewrites', sub: 'Proposals for your review' },
];

// Decorative detection boxes (normalised x, y, w, h).
const BOXES = [
  [
    [0.06, 0.26, 0.42, 0.5, 'chart', false],
    [0.54, 0.3, 0.38, 0.3, 'kpi', false],
    [0.05, 0.08, 0.5, 0.1, 'title?', true],
  ],
  [
    [0.05, 0.3, 0.88, 0.26, 'process-flow', true],
    [0.05, 0.62, 0.88, 0.14, 'labels', false],
  ],
  [
    [0.05, 0.26, 0.55, 0.6, 'table · merged', true],
    [0.64, 0.3, 0.3, 0.46, 'chart', false],
    [0.05, 0.88, 0.7, 0.06, 'footnote*', true],
  ],
];

function Counter({ value, label }) {
  const v = useCountUp(value, 600);
  return (
    <div className="counter">
      <b>{v}</b>
      <span>{label}</span>
    </div>
  );
}

export default function ProcessingScreen({ proc }) {
  const { name, step, progress, previews = [], stats = {} } = proc;
  const shown = previews.slice(-3);
  const boxes = step >= 1 && step < 5 ? BOXES[(previews.length - 1 + 3) % 3] : [];

  return (
    <div className="screen processing">
      <div className="proc-stage">
        <div className="proc-grid" />
        <div className="proc-pages">
          {shown.length === 0 && <div className="proc-page" style={{ background: '#1c2029' }} />}
          {shown.map((p, i) => {
            const depth = shown.length - 1 - i;
            return (
              <div key={p.key} className="proc-page" style={{ transform: `translate(${depth * -22}px, ${depth * -18}px) scale(${1 - depth * 0.05})`, opacity: depth ? 0.5 - depth * 0.12 : 1, zIndex: 10 - depth }}>
                {p.src ? <img src={p.src} alt="" /> : <SlidePreview section={p.section} />}
                {depth === 0 && (
                  <div className="proc-boxes">
                    {boxes.map(([x, y, w, h, label, warn], bi) => (
                      <div key={`${p.key}-${bi}`} className={`pbox${warn ? ' warn' : ''}`} style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`, animationDelay: `${bi * 0.18}s` }}>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div className="proc-beam" />
        </div>
      </div>

      <div className="proc-side">
        <span className="eyebrow">
          <Icon name="cpu" size={15} /> Analysing
        </span>
        <h2>Reading it the way an AI would.</h2>
        <div className="proc-file">
          <Icon name="doc" size={16} /> {name}
        </div>
        <ol className="proc-steps">
          {PROC_STEPS.map((s, i) => (
            <li key={s.title} className={`proc-step${i < step ? ' done' : i === step ? ' active' : ''}`}>
              <span className="st-ico">{i < step ? <Icon name="check" size={15} stroke={2.4} /> : null}</span>
              <span>
                {s.title}
                <small>{s.sub}</small>
              </span>
              {i < step && <span className="chip ready">done</span>}
            </li>
          ))}
        </ol>
        <div className="progress" aria-label="Progress">
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <div className="proc-counters">
          <Counter value={stats.pages || 0} label="pages read" />
          <Counter value={stats.visuals || 0} label="visual structures" />
          <Counter value={stats.issues || 0} label="AI-risk zones" />
        </div>
      </div>
    </div>
  );
}
