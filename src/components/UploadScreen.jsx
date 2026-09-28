import { useRef, useState } from 'react';
import { Icon } from './ui.jsx';

const FIXES = [
  {
    icon: 'chart',
    title: 'Charts',
    raw: '0% 0.5% 1.0% Top quartile Peer median Northwind 0.6 0.9 1.4',
    ready: 'Northwind: 1.4% of revenue — 56% above peer median (0.9%).',
  },
  {
    icon: 'flow',
    title: 'Process flows',
    raw: '4 wks 6 wks 12 wks Diagnose Design Build G1 G2',
    ready: 'Diagnose (wk 1–4) → Gate 1 → Design (wk 5–10) → Gate 2 → Build…',
  },
  {
    icon: 'table',
    title: 'Dense tables',
    raw: 'Wave 1 Invoice capture P2P 18 240 7 Bank rec. R2R 9 110 6',
    ready: 'Bank reconciliation — Wave 1 · 9 FTE · €110k · 6-month payback.',
  },
  {
    icon: 'spark',
    title: 'Implicit messages',
    raw: 'Our understanding · Cost Speed Control · 1.4% 11 days 38%',
    ready: 'Key message: finance is costly, slow and control-heavy.',
  },
];

export default function UploadScreen({ onFile, onSample, error }) {
  const [dragging, setDragging] = useState(false);
  const input = useRef(null);
  const depth = useRef(0);

  const onDrop = (e) => {
    e.preventDefault();
    depth.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div className="screen">
      <section className="upload">
        <div className="hero">
          <span className="eyebrow">
            <Icon name="sparkles" size={15} /> AI-Ready proposals
          </span>
          <h1>
            Your deck is read by an <em>AI</em> before it’s read by a person.
          </h1>
          <p className="lead">
            Clients drop our proposals straight into Copilot and custom GPTs. Lucid turns visual PDF and PowerPoint decks into a clean Markdown + JSON package — charts, diagrams, tables and implicit messages restated so machines read them the way we meant them.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-lg" onClick={() => input.current?.click()}>
              <Icon name="upload" size={18} /> Upload a deck
            </button>
            <button className="btn btn-lg" onClick={onSample}>
              <Icon name="eye" size={18} /> Try the sample proposal
            </button>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <b>7</b>
              <span>misread patterns detected</span>
            </div>
            <div className="hero-stat">
              <b>2</b>
              <span>formats · Markdown & JSON</span>
            </div>
            <div className="hero-stat">
              <b>0</b>
              <span>bytes leave your browser</span>
            </div>
          </div>
        </div>

        <div
          className={`dropzone${dragging ? ' dragging' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Upload a PDF or PowerPoint file"
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault();
            depth.current++;
            setDragging(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => {
            depth.current = Math.max(0, depth.current - 1);
            if (!depth.current) setDragging(false);
          }}
          onDrop={onDrop}
        >
          <div className="scanline" />
          <div className="slide-stack">
            <div className="stack-sheet">
              <div className="sheet-bar" />
              <div className="sheet-title" />
              <div className="sheet-lines">
                <i style={{ width: '90%' }} />
                <i style={{ width: '70%' }} />
                <i style={{ width: '80%' }} />
              </div>
            </div>
            <div className="stack-sheet">
              <div className="sheet-bar" />
              <div className="sheet-title" style={{ width: '50%' }} />
              <div className="sheet-flow">
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="stack-sheet">
              <div className="sheet-bar" />
              <div className="sheet-title" />
              <div className="sheet-bars">
                <i style={{ height: '95%' }} />
                <i style={{ height: '62%' }} />
                <i style={{ height: '40%' }} />
                <i style={{ height: '72%' }} />
              </div>
            </div>
          </div>
          <h3>{dragging ? 'Release to analyse' : 'Drop a PDF or PowerPoint'}</h3>
          <div className="muted">
            or <span style={{ color: 'var(--accent)', fontWeight: 600 }}>browse your files</span>
          </div>
          <div className="formats">
            <span className="chip">PDF</span>
            <span className="chip">PPTX</span>
            <span className="chip muted">up to 40 pages</span>
          </div>
          {error && (
            <div className="error-banner" onClick={(e) => e.stopPropagation()}>
              <Icon name="info" size={17} />
              <span>{error}</span>
            </div>
          )}
          <input
            ref={input}
            type="file"
            accept=".pdf,.pptx,.ppt,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onFile(f);
            }}
          />
        </div>
      </section>

      <section className="fix-grid">
        {FIXES.map((f, i) => (
          <div className="fix-card" key={f.title} style={{ animation: `screenIn .6s ${0.15 + i * 0.08}s var(--ease) both` }}>
            <h4>
              <span className="ico">
                <Icon name={f.icon} size={16} />
              </span>
              {f.title}
            </h4>
            <div className="before-after">
              <div className="ba raw">
                <small>What the AI reads</small>
                {f.raw}
              </div>
              <div className="ba ready">
                <small>AI-Ready</small>
                {f.ready}
              </div>
            </div>
          </div>
        ))}
      </section>
      <div className="privacy-note">
        <Icon name="shield" size={15} /> Files are parsed locally in your browser. Nothing is uploaded, and no external AI service is called.
      </div>
    </div>
  );
}
