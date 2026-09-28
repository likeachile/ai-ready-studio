import { useEffect, useMemo, useState } from 'react';
import { CATEGORY, STATUS, provenanceOf, readiness, resolveDocument } from '../lib/model.js';
import { truncate } from '../lib/text.js';
import SlidePreview from './SlidePreview.jsx';
import { Icon, ScoreRing } from './ui.jsx';

const BLOCK_META = {
  text: { icon: 'doc', label: 'Text' },
  bullets: { icon: 'doc', label: 'Bullet list' },
  cards: { icon: 'layers', label: 'Icon cards' },
  kpis: { icon: 'target', label: 'Key figures' },
  chart: { icon: 'chart', label: 'Chart' },
  diagram: { icon: 'flow', label: 'Diagram' },
  table: { icon: 'table', label: 'Table' },
  visual: { icon: 'image', label: 'Visual' },
};

const ORIGIN = {
  user: ['Written by you', 'ready'],
  explicit: ['Stated in source', 'info'],
  source: ['Stated in source', 'info'],
  reviewed: ['Confirmed draft', 'ready'],
  author: ['Rewritten by you', 'ready'],
  'auto-draft': ['Auto-draft · to review', 'warn'],
  missing: ['Missing', 'raw'],
};

function blockSummary(b) {
  switch (b.type) {
    case 'text':
      return b.text;
    case 'bullets':
      return b.items.map((i) => i.text).join(' · ');
    case 'cards':
      return b.items.map((i) => i.title).join(' · ');
    case 'kpis':
      return b.items.map((k) => `${k.value} ${k.label}`).join(' · ');
    case 'chart':
      return b.title || (b.values ? `Values: ${b.values.slice(0, 8).join(', ')}` : `${b.chartType} chart`);
    case 'diagram':
      return b.nodes.map((n) => n.label).join(' → ');
    case 'table':
      return `${b.rows.length} rows × ${b.columns.length} cols — ${b.columns.filter(Boolean).join(', ')}`;
    case 'visual':
      return 'Image / visual-only content';
    default:
      return '';
  }
}

function Thumb({ section, total }) {
  return <div className="rail-thumb">{section.thumbnail ? <img src={section.thumbnail} alt="" loading="lazy" /> : <SlidePreview section={section} total={total} />}</div>;
}

function IssueCard({ issue, section, active, onToggle, onUpdate, showPage }) {
  const cat = CATEGORY[issue.category];
  const [draft, setDraft] = useState(issue.status === 'edited' ? issue.resolution : issue.proposal);
  useEffect(() => setDraft(issue.status === 'edited' ? issue.resolution : issue.proposal), [issue.id, issue.status, issue.resolution, issue.proposal]);
  const changed = draft.trim() !== issue.proposal.trim();
  const resolved = issue.status !== 'open';

  return (
    <article className={`issue${active ? ' open-card' : ''}${resolved ? ' resolved' : ''}`}>
      <button className="issue-top" onClick={onToggle} aria-expanded={active}>
        <span className={`issue-cat sev-${issue.severity}`}>
          <Icon name={cat.icon} size={15} />
        </span>
        <span>
          <b>{issue.title}</b>
          <small>
            <span className={`dot sev-${issue.severity}`} />
            {issue.severity} · {cat.short}
            {showPage && section ? ` · p.${section.page}` : ''}
          </small>
        </span>
        {resolved ? (
          <span className={`chip ${STATUS[issue.status].tone}`}>
            {issue.status === 'dismissed' ? <Icon name="x" size={12} /> : <Icon name="check" size={12} stroke={2.4} />}
            {STATUS[issue.status].label}
          </span>
        ) : (
          <Icon name={active ? 'chevronDown' : 'chevron'} size={16} style={{ color: 'var(--text-3)' }} />
        )}
      </button>

      {active && (
        <div className="issue-body">
          <p className="issue-detail">{issue.detail}</p>
          <div>
            <div className="lens-label raw">
              <Icon name="eye" size={13} /> What an AI reads today
            </div>
            <div className="ai-sees">{issue.aiReads}</div>
          </div>
          <div className="rewrite">
            <div className="lens-label ready" style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Icon name="sparkles" size={13} /> AI-Ready rewrite
              </span>
              {changed && (
                <button className="btn btn-ghost btn-sm" style={{ height: 22 }} onClick={() => setDraft(issue.proposal)}>
                  <Icon name="undo" size={13} /> Reset to draft
                </button>
              )}
            </div>
            <textarea className="textarea" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="AI-Ready rewrite" />
          </div>
          <div className="issue-actions">
            {changed ? (
              <button className="btn btn-ready btn-sm" disabled={!draft.trim()} onClick={() => onUpdate({ status: 'edited', resolution: draft.trim() }, true)}>
                <Icon name="check" size={15} stroke={2.2} /> Save my rewrite
              </button>
            ) : (
              <button className="btn btn-ready btn-sm" onClick={() => onUpdate({ status: 'accepted', resolution: '' }, true)} disabled={issue.status === 'accepted'}>
                <Icon name="check" size={15} stroke={2.2} /> {issue.status === 'accepted' ? 'Accepted' : 'Accept draft'}
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => onUpdate({ status: 'dismissed' }, true)} disabled={issue.status === 'dismissed'}>
              <Icon name="x" size={14} /> Not an issue
            </button>
            <span className="spacer" />
            {resolved && (
              <button className="btn btn-ghost btn-sm" onClick={() => onUpdate({ status: 'open', resolution: '' }, false)}>
                <Icon name="undo" size={14} /> Reopen
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export default function ReviewScreen({ doc, onIssueUpdate, onSectionUpdate, onDocUpdate, onAcceptAll, onContinue }) {
  const [selected, setSelected] = useState(() => doc.issues[0]?.target.sectionId || doc.sections[0]?.id);
  const [activeIssue, setActiveIssue] = useState(() => doc.issues[0]?.id || null);
  const [scope, setScope] = useState('page');
  const [filter, setFilter] = useState('all');

  const resolved = useMemo(() => resolveDocument(doc), [doc]);
  const score = useMemo(() => readiness(doc), [doc]);
  const sectionById = useMemo(() => new Map(resolved.sections.map((s) => [s.id, s])), [resolved]);
  const section = sectionById.get(selected);
  const sourceSection = doc.sections.find((s) => s.id === selected);
  const idx = doc.sections.findIndex((s) => s.id === selected);
  const total = doc.sections.length;

  const openBySection = useMemo(() => {
    const m = new Map();
    for (const i of doc.issues) m.set(i.target.sectionId, (m.get(i.target.sectionId) || 0) + (i.status === 'open' ? 1 : 0));
    return m;
  }, [doc.issues]);
  const countBySection = useMemo(() => {
    const m = new Map();
    for (const i of doc.issues) m.set(i.target.sectionId, (m.get(i.target.sectionId) || 0) + 1);
    return m;
  }, [doc.issues]);

  const effectiveScope = selected === 'doc' ? 'all' : scope;
  const scoped = doc.issues.filter((i) => effectiveScope === 'all' || i.target.sectionId === selected);
  const categories = [...new Set(scoped.map((i) => i.category))];
  const visible = scoped.filter((i) => (filter === 'all' ? true : filter === 'open' ? i.status === 'open' : i.category === filter));
  const activeObj = doc.issues.find((i) => i.id === activeIssue);

  useEffect(() => {
    if (filter !== 'all' && filter !== 'open' && !categories.includes(filter)) setFilter('all');
  }, [selected, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectSection = (id) => {
    setSelected(id);
    if (id === 'doc') return;
    const first = doc.issues.find((i) => i.target.sectionId === id && i.status === 'open') || doc.issues.find((i) => i.target.sectionId === id);
    setActiveIssue(first?.id || null);
  };

  const toggleIssue = (issue) => {
    if (activeIssue === issue.id) return setActiveIssue(null);
    setActiveIssue(issue.id);
    if (selected !== 'doc') setSelected(issue.target.sectionId);
  };

  const updateIssue = (issue, patch, advance) => {
    onIssueUpdate(issue.id, patch);
    if (!advance) return;
    // Advance to the next open issue in the current list, then anywhere in the document.
    const order = [...visible, ...doc.issues.filter((i) => !visible.includes(i))];
    const next = order.slice(order.indexOf(issue) + 1).find((i) => i.status === 'open' && i.id !== issue.id) || order.find((i) => i.status === 'open' && i.id !== issue.id);
    setTimeout(() => {
      setActiveIssue(next?.id || null);
      if (next && selected !== 'doc') setSelected(next.target.sectionId);
    }, 280);
  };

  // Key message: if an issue targets it, edits flow through that issue so there is one source of truth.
  const kmIssue = doc.issues.find((i) => i.target.sectionId === selected && i.target.field === 'keyMessage' && !i.target.blockId);
  const kmProvenance = section ? (sourceSection?.keyMessageOrigin === 'user' ? 'user' : kmIssue ? provenanceOf(resolved, section.id, null, 'keyMessage') : sourceSection?.keyMessageOrigin || 'missing') : null;
  const kmOrigin = ORIGIN[kmIssue?.status === 'dismissed' && !section?.keyMessage ? 'missing' : kmProvenance] || ORIGIN.missing;
  const setKeyMessage = (value) => {
    if (kmIssue) onIssueUpdate(kmIssue.id, { status: 'edited', resolution: value });
    else onSectionUpdate(selected, { keyMessage: value, keyMessageOrigin: 'user' });
  };

  const flaggedBlocks = new Map(doc.issues.filter((i) => i.target.sectionId === selected && i.target.blockId).map((i) => [i.target.blockId, i]));

  return (
    <div className="screen">
      <div className="review-head">
        <div className="review-title">
          <span className="eyebrow">
            <Icon name="target" size={15} /> Review & refine
          </span>
          <h2 style={{ marginTop: 8 }}>{score.total ? `${score.total} places where an AI is likely to misread this deck` : 'No major AI-risk zones detected'}</h2>
          <p>Confirm, rewrite or dismiss each finding. Anything left open ships as an auto-draft, flagged as such in the JSON.</p>
        </div>
        <div className="score-strip">
          <div className="score-pair">
            <ScoreRing value={score.original} tone="raw" label="Original AI-readability" />
            <Icon name="arrow" size={16} className="ring-arrow" />
            <ScoreRing value={score.current} label="AI-readability of the package" />
          </div>
          <div className="score-meta">
            <b>
              {score.reviewed}/{score.total} reviewed
            </b>
            AI-readability score
          </div>
          <div className="divider-v" />
          <button className="btn btn-sm" onClick={onAcceptAll} disabled={!score.open}>
            <Icon name="bolt" size={15} /> Accept remaining drafts
          </button>
          <button className="btn btn-primary btn-sm" onClick={onContinue}>
            Generate package <Icon name="arrow" size={15} />
          </button>
        </div>
      </div>

      <div className="review-layout">
        {/* ── Page rail ── */}
        <nav className="rail card" aria-label="Pages">
          <button className={`rail-item${selected === 'doc' ? ' active' : ''}`} onClick={() => selectSection('doc')}>
            <div className="rail-thumb doc">
              <Icon name="doc" size={20} />
            </div>
            <div className="rail-text">
              <b>Document & summary</b>
              <div className="rail-meta">Title, client, executive summary</div>
            </div>
          </button>
          {resolved.sections.map((s) => {
            const open = openBySection.get(s.id) || 0;
            const count = countBySection.get(s.id) || 0;
            return (
              <button key={s.id} className={`rail-item${selected === s.id ? ' active' : ''}`} onClick={() => selectSection(s.id)}>
                <Thumb section={s} total={total} />
                <div className="rail-text">
                  <b>{s.title}</b>
                  <div className="rail-meta">
                    p.{s.page}
                    {count > 0 &&
                      (open ? (
                        <span className="pill-count">{open} open</span>
                      ) : (
                        <span className="pill-count ok">
                          <Icon name="check" size={10} stroke={3} /> done
                        </span>
                      ))}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>

        {/* ── Canvas ── */}
        <div className="canvas">
          {selected === 'doc' ? (
            <div className="card card-pad section-editor">
              <div>
                <div className="field-label">Document title</div>
                <input className="input" value={doc.meta.title} onChange={(e) => onDocUpdate({ meta: { ...doc.meta, title: e.target.value } })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                {[
                  ['client', 'Client'],
                  ['issuer', 'Issued by'],
                  ['date', 'Date'],
                ].map(([k, label]) => (
                  <div key={k}>
                    <div className="field-label">{label}</div>
                    <input className="input" value={doc.meta[k] || ''} placeholder="—" onChange={(e) => onDocUpdate({ meta: { ...doc.meta, [k]: e.target.value } })} />
                  </div>
                ))}
              </div>
              <div>
                <div className="field-label">
                  Executive summary
                  <span className={`chip ${doc.summaryOrigin === 'auto' ? 'warn' : 'ready'} origin-badge`}>{doc.summaryOrigin === 'auto' ? 'Auto-generated — refine' : 'Author-validated'}</span>
                </div>
                <textarea className="textarea" style={{ minHeight: 150 }} value={doc.summary} onChange={(e) => onDocUpdate({ summary: e.target.value, summaryOrigin: 'user' })} />
              </div>
              <div>
                <div className="field-label">Key messages at a glance</div>
                <div className="outline-list">
                  {resolved.sections
                    .filter((s) => s.kind !== 'cover')
                    .map((s) => (
                      <button key={s.id} className="outline-item" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => selectSection(s.id)}>
                        <span className="oi-ico" style={{ fontSize: 11, fontWeight: 700 }}>
                          {s.page}
                        </span>
                        <span>
                          <b style={{ fontSize: 13 }}>{s.title}</b>
                          <p>{s.keyMessage || <em style={{ color: 'var(--raw)' }}>No key message</em>}</p>
                        </span>
                        <Icon name="chevron" size={15} style={{ color: 'var(--text-3)' }} />
                      </button>
                    ))}
                </div>
              </div>
            </div>
          ) : (
            section && (
              <>
                <div className="card canvas-preview">
                  <div className="canvas-toolbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="chip">
                        Page {section.page} / {doc.meta.source.pages}
                      </span>
                      <span className="chip muted">{section.thumbnail ? 'Original rendering' : doc.isSample ? 'Original slide' : 'Reconstructed from PPTX'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost icon-btn" disabled={idx <= 0} onClick={() => selectSection(doc.sections[idx - 1].id)} aria-label="Previous page">
                        <Icon name="back" size={16} />
                      </button>
                      <button className="btn btn-ghost icon-btn" disabled={idx >= total - 1} onClick={() => selectSection(doc.sections[idx + 1].id)} aria-label="Next page">
                        <Icon name="arrow" size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="page-frame">{section.thumbnail ? <img src={section.thumbnail} alt={`Page ${section.page}`} /> : <SlidePreview section={sourceSection} total={total} highlightBlockId={activeObj?.target.sectionId === selected ? activeObj?.target.blockId : null} footLabel={doc.meta.confidentiality} />}</div>
                </div>

                <div className="card card-pad section-editor">
                  <div>
                    <div className="field-label">Section title</div>
                    <input className="input" value={sourceSection.title} onChange={(e) => onSectionUpdate(selected, { title: e.target.value })} />
                  </div>
                  <div className="km-row">
                    <div className="field-label">
                      Key message
                      <span className={`chip ${kmOrigin[1]} origin-badge`}>{kmOrigin[0]}</span>
                    </div>
                    <textarea className="textarea" style={{ minHeight: 80 }} placeholder="State the one sentence this page must convey…" value={section.keyMessage || ''} onChange={(e) => setKeyMessage(e.target.value)} />
                  </div>
                  <div>
                    <div className="field-label">Detected structure</div>
                    <div className="outline-list">
                      {section.blocks.map((b) => {
                        const flag = flaggedBlocks.get(b.id);
                        const meta = BLOCK_META[b.type] || BLOCK_META.text;
                        return (
                          <div key={b.id} className={`outline-item${flag ? ' flagged' : ''}${flag && flag.id === activeIssue ? ' hl' : ''}`} onClick={() => flag && setActiveIssue(flag.id)} style={flag ? { cursor: 'pointer' } : undefined}>
                            <span className="oi-ico">
                              <Icon name={meta.icon} size={14} />
                            </span>
                            <span>
                              <b style={{ fontSize: 12.5 }}>{b.small ? 'Footnote' : meta.label}</b>
                              <p>{truncate(blockSummary(b), 180)}</p>
                            </span>
                            {flag && <span className={`chip ${flag.status === 'open' ? 'warn' : 'ready'}`}>{flag.status === 'open' ? 'flagged' : 'fixed'}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )
          )}
        </div>

        {/* ── Issues ── */}
        <aside className="card issues-panel">
          <div className="issues-head">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <h3>
                <Icon name="sparkles" size={16} style={{ color: 'var(--accent)' }} /> AI-risk zones
              </h3>
              {selected !== 'doc' && (
                <div className="tabs">
                  <button className={`tab${scope === 'page' ? ' on' : ''}`} onClick={() => setScope('page')} style={{ height: 24, fontSize: 12 }}>
                    This page
                  </button>
                  <button className={`tab${scope === 'all' ? ' on' : ''}`} onClick={() => setScope('all')} style={{ height: 24, fontSize: 12 }}>
                    All
                  </button>
                </div>
              )}
            </div>
            <div className="filter-row">
              <button className={`filter-chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>
                All · {scoped.length}
              </button>
              <button className={`filter-chip${filter === 'open' ? ' on' : ''}`} onClick={() => setFilter('open')}>
                To review · {scoped.filter((i) => i.status === 'open').length}
              </button>
              {categories.map((c) => (
                <button key={c} className={`filter-chip${filter === c ? ' on' : ''}`} onClick={() => setFilter(c)}>
                  {CATEGORY[c].short}
                </button>
              ))}
            </div>
          </div>
          <div className="issues-scroll">
            {visible.length === 0 ? (
              <div className="empty-state">
                <div className="big-check">
                  <Icon name="check" size={26} stroke={2.4} />
                </div>
                <b style={{ color: 'var(--text)' }}>{scoped.length ? 'Nothing left in this view' : 'This page reads cleanly'}</b>
                <div style={{ fontSize: 13, marginTop: 4 }}>{scoped.length ? 'Every finding here has been handled.' : 'No AI-risk zones were detected on this page.'}</div>
              </div>
            ) : (
              visible.map((i) => <IssueCard key={i.id} issue={i} section={sectionById.get(i.target.sectionId)} showPage={effectiveScope === 'all'} active={i.id === activeIssue} onToggle={() => toggleIssue(i)} onUpdate={(patch, adv) => updateIssue(i, patch, adv)} />)
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
