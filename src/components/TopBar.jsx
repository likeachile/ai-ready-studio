import { Icon, PrismMark } from './ui.jsx';

const STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'processing', label: 'Analyse' },
  { id: 'review', label: 'Review' },
  { id: 'package', label: 'Package' },
  { id: 'battle', label: 'Battle' },
];

export default function TopBar({ stage, hasDoc, fileName, onNavigate, onReset }) {
  const current = STEPS.findIndex((s) => s.id === stage);
  const canGo = (id) => (id === 'upload' ? stage !== 'processing' : id === 'processing' ? false : hasDoc && stage !== 'processing');
  return (
    <header className="topbar">
      <button className="brand" onClick={() => canGo('upload') && onReset()} title="Start over">
        <span className="brand-mark">
          <PrismMark size={22} />
        </span>
        <span>
          <div className="brand-name">
            Lucid <span className="brand-chip">EY Accelerator · POC</span>
          </div>
          <div className="brand-sub">AI-Ready Proposal Studio</div>
        </span>
      </button>

      <nav className="stepper" aria-label="Progress">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            className={`step${s.id === stage ? ' active' : ''}${i < current || (hasDoc && i < 2 && stage !== 'processing') ? ' done' : ''}${s.id === 'battle' ? ' battle' : ''}`}
            disabled={!canGo(s.id) || s.id === stage}
            onClick={() => (s.id === 'upload' ? onReset() : onNavigate(s.id))}
            aria-current={s.id === stage ? 'step' : undefined}
          >
            <span className="step-num">{i < current || (hasDoc && i < 2 && stage !== 'processing') ? <Icon name="check" size={13} stroke={2.4} /> : s.id === 'battle' ? <Icon name="battle" size={13} stroke={2} /> : i + 1}</span>
            <span className="lbl">{s.label}</span>
          </button>
        ))}
      </nav>

      <div className="topbar-right">
        {fileName && (
          <div className="file-chip" title={fileName}>
            <Icon name="doc" size={15} />
            <span>{fileName}</span>
          </div>
        )}
        {hasDoc && stage !== 'processing' && (
          <button className="btn btn-sm btn-ghost" onClick={onReset}>
            <Icon name="plus" size={15} /> New
          </button>
        )}
      </div>
    </header>
  );
}
