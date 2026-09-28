import { useEffect, useMemo, useRef, useState } from 'react';
import { simulate, suggestedQuestions } from '../lib/simulate.js';
import { Icon, RichText, useCountUp } from './ui.jsx';

const VERDICT = {
  wrong: ['Incorrect', 'raw'],
  partial: ['Partial', 'warn'],
  vague: ['Vague', 'warn'],
  miss: ['No answer', 'raw'],
  ok: ['Unverified', 'muted'],
  grounded: ['Grounded', 'ready'],
  'not-covered': ['Not in document', 'info'],
};
const METRICS = [
  ['accuracy', 'Accuracy'],
  ['completeness', 'Completeness'],
  ['traceability', 'Traceability'],
];
const avg = (s) => Math.round((s.accuracy + s.completeness + s.traceability) / 3);

function useTypewriter(text, start, onDone) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!start) return;
    let i = 0;
    const step = Math.max(2, Math.round(text.length / 110));
    const id = setInterval(() => {
      i = Math.min(text.length, i + step);
      setN(i);
      if (i >= text.length) {
        clearInterval(id);
        onDone?.();
      }
    }, 16);
    return () => clearInterval(id);
  }, [start, text]); // eslint-disable-line react-hooks/exhaustive-deps
  return text.slice(0, n);
}

function Answer({ side, data, phase, instant, onTyped }) {
  const [typed, setTyped] = useState(instant);
  const [showCtx, setShowCtx] = useState(false);
  const shown = useTypewriter(data.text, phase === 'answer' && !instant, () => {
    setTyped(true);
    onTyped?.();
  });
  const done = instant || typed;
  const [label, tone] = VERDICT[data.verdict] || VERDICT.ok;
  const isRaw = side === 'raw';

  return (
    <div className={`answer ${side}`}>
      <div className="answer-head">
        <div className="answer-who">
          <span className="bot-ava" style={{ color: isRaw ? 'var(--raw)' : 'var(--ready)' }}>
            <Icon name={isRaw ? 'file' : 'sparkles'} size={14} />
          </span>
          {isRaw ? 'Assistant · original PDF' : 'Assistant · AI-Ready package'}
        </div>
        {done && (
          <span className={`chip ${tone}`} style={{ animation: 'pop .4s var(--ease-spring) both' }}>
            {tone === 'ready' ? <Icon name="check" size={12} stroke={2.4} /> : <span className="dot" />}
            {label}
          </span>
        )}
      </div>

      <div className="answer-text">
        {phase === 'thinking' ? (
          <div className="thinking">
            <div className="shimmer" style={{ width: '92%' }} />
            <div className="shimmer" style={{ width: '78%' }} />
            <div className="shimmer" style={{ width: '54%' }} />
          </div>
        ) : (
          <RichText text={done ? data.text : shown} caret={!done} />
        )}
      </div>

      {done && isRaw && data.why && (
        <div className="why">
          <Icon name="info" size={15} style={{ flex: 'none', marginTop: 1 }} />
          <span>
            <b>Why it fails:</b> {data.why}
          </span>
        </div>
      )}
      {done && !isRaw && data.sources?.length > 0 && (
        <div className="sources">
          {data.sources.map((s) => (
            <span key={s.id} className="chip ready">
              <Icon name="link" size={12} /> p.{s.page} · {s.title}
            </span>
          ))}
        </div>
      )}

      <div className="metrics">
        {METRICS.map(([k, l]) => (
          <div className="metric" key={k}>
            <span>{l}</span>
            <div className="metric-bar">
              <i style={{ width: done ? `${data.scores[k]}%` : 0 }} />
            </div>
            <b>{done ? data.scores[k] : '–'}</b>
          </div>
        ))}
      </div>

      {data.context?.length > 0 && (
        <>
          <button className="context-toggle" onClick={() => setShowCtx((v) => !v)}>
            <Icon name={showCtx ? 'chevronDown' : 'chevron'} size={14} />
            {showCtx ? 'Hide' : 'Show'} what the model received
          </button>
          {showCtx && <div className="context-box">{data.context.join('\n\n')}</div>}
        </>
      )}
    </div>
  );
}

function Round({ round, onSettled }) {
  const [phase, setPhase] = useState(round.settled ? 'answer' : 'thinking');
  const [readyStart, setReadyStart] = useState(round.settled);
  const [typedCount, setTypedCount] = useState(round.settled ? 2 : 0);
  const ref = useRef(null);

  useEffect(() => {
    if (round.settled) return;
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const t1 = setTimeout(() => setPhase('answer'), 850);
    const t2 = setTimeout(() => setReadyStart(true), 1150);
    return () => [t1, t2].forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typedCount === 2 && !round.settled) onSettled(round.id);
  }, [typedCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const { raw, ready } = round.result;
  const delta = ready.scores.accuracy - raw.scores.accuracy;
  const bump = () => setTypedCount((c) => c + 1);

  return (
    <div className="round" ref={ref} style={{ scrollMarginTop: 90 }}>
      <div className="round-q">
        <div>
          <span className="qa-ico">
            <Icon name="send" size={12} stroke={2.2} />
          </span>
          {round.result.question}
        </div>
      </div>
      <div className="round-grid">
        <Answer side="raw" data={raw} phase={phase} instant={round.settled} onTyped={bump} />
        <Answer side="ready" data={ready} phase={readyStart ? 'answer' : 'thinking'} instant={round.settled} onTyped={bump} />
        {typedCount >= 2 && (
          <div className="delta-badge" title="Accuracy gain">
            <span>
              {delta >= 0 ? '+' : ''}
              {delta}
              <small>PTS</small>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Score({ value, label, side }) {
  const v = useCountUp(value);
  return (
    <div className={`sb-side ${side}`}>
      <b>{v}</b>
      <span>{label}</span>
    </div>
  );
}

export default function BattleScreen({ doc, rounds, setRounds }) {
  const [q, setQ] = useState('');
  const suggestions = useMemo(() => suggestedQuestions(doc), [doc]);
  const busy = rounds.some((r) => !r.settled);
  const settled = rounds.filter((r) => r.settled);
  const rawAvg = settled.length ? Math.round(settled.reduce((a, r) => a + avg(r.result.raw.scores), 0) / settled.length) : 0;
  const readyAvg = settled.length ? Math.round(settled.reduce((a, r) => a + avg(r.result.ready.scores), 0) / settled.length) : 0;
  const asked = new Set(rounds.map((r) => r.result.question));

  const ask = (question) => {
    const text = question.trim();
    if (!text || busy) return;
    setRounds((rs) => [...rs, { id: `${Date.now()}`, result: simulate(text, doc), settled: false }]);
    setQ('');
  };
  const settle = (id) => setRounds((rs) => rs.map((r) => (r.id === id ? { ...r, settled: true } : r)));

  return (
    <div className="screen">
      <div className="battle-head">
        <div>
          <span className="eyebrow">
            <Icon name="battle" size={15} /> Battle mode
          </span>
          <h2>Same question. Two sources. See the difference.</h2>
          <p>A simulated enterprise assistant answers from the text a copilot actually extracts from the PDF (left) and from your AI-Ready package (right).</p>
        </div>
        <div className="card scoreboard">
          <Score value={rawAvg} label="Original PDF" side="raw" />
          <div className="sb-vs">
            <span className="vs-mark">
              <i style={{ background: 'var(--raw)' }} />
              VS
              <i style={{ background: 'var(--ready)' }} />
            </span>
            <span className="delta">{settled.length ? `+${readyAvg - rawAvg} pts` : 'Ask a question'}</span>
            <span className="subtle" style={{ fontSize: 11 }}>
              avg. answer quality · {settled.length} question{settled.length === 1 ? '' : 's'}
            </span>
          </div>
          <Score value={readyAvg} label="AI-Ready" side="ready" />
        </div>
      </div>

      <div className="arena-cols">
        <div className="arena-col-head raw">
          <span className="ach-ico">
            <Icon name="file" size={18} />
          </span>
          <span>
            <b>Original PDF</b>
            <span>Flat text stream as extracted by Copilot / GPT file readers</span>
          </span>
        </div>
        <div className="arena-col-head ready">
          <span className="ach-ico">
            <Icon name="sparkles" size={18} />
          </span>
          <span>
            <b>AI-Ready package</b>
            <span>Structured Markdown + JSON with explicit messages</span>
          </span>
        </div>
      </div>

      {rounds.length === 0 ? (
        <div className="arena-empty">
          <Icon name="battle" size={34} style={{ color: 'var(--accent)' }} />
          <h3>Put both versions to the test</h3>
          <div>Pick a suggested question below, or ask your own — the kind of thing a client would type into Copilot.</div>
        </div>
      ) : (
        <div className="rounds">
          {rounds.map((r) => (
            <Round key={r.id} round={r} onSettled={settle} />
          ))}
        </div>
      )}

      <div className="composer">
        <div className="suggestions">
          {suggestions.map((s) => (
            <button key={s} className={`suggestion${asked.has(s) ? ' used' : ''}`} onClick={() => ask(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
        <form
          className="composer-row"
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question about this proposal…" aria-label="Question" />
          {rounds.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRounds([])} disabled={busy}>
              <Icon name="refresh" size={14} /> Clear
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={!q.trim() || busy}>
            <Icon name="send" size={15} /> Ask both
          </button>
        </form>
      </div>
    </div>
  );
}
