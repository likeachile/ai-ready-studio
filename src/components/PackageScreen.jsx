import { useMemo, useState } from 'react';
import { buildZip, downloadBlob, packageBaseName, toJSON, toMarkdown } from '../lib/export.js';
import { readiness, resolveDocument } from '../lib/model.js';
import { formatBytes } from '../lib/text.js';
import { Icon, renderInline, ScoreRing } from './ui.jsx';

// ── Source highlighting ──
function mdTokens(line, inFm) {
  if (inFm || line === '---') return <span className="tk-fm">{line}</span>;
  if (/^#{1,6}\s/.test(line)) return <span className="tk-h">{line}</span>;
  if (line.startsWith('>')) return <span className="tk-q">{line}</span>;
  if (line.startsWith('|')) return <span className="tk-tbl">{line}</span>;
  const li = line.match(/^(\s*(?:-|\d+\.)\s)(.*)$/);
  const rest = li ? li[2] : line;
  const parts = rest.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') ? <span key={i} className="tk-b">{p}</span> : p));
  return li ? (
    <>
      <span className="tk-li">{li[1]}</span>
      {parts}
    </>
  ) : (
    parts
  );
}

function jsonTokens(line) {
  const out = [];
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)|\b(true|false|null)\b/gi;
  let last = 0;
  let m;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    if (m[1]) out.push(<span key={m.index} className={m[2] ? 'tk-key' : 'tk-str'}>{m[1]}</span>, m[2] || '');
    else if (m[3]) out.push(<span key={m.index} className="tk-num">{m[3]}</span>);
    else out.push(<span key={m.index} className="tk-bool">{m[4]}</span>);
    last = re.lastIndex;
  }
  out.push(line.slice(last));
  return out;
}

function CodeView({ text, kind }) {
  const lines = text.split('\n');
  let fm = kind === 'md' && lines[0] === '---';
  return (
    <div className="code-view">
      {lines.map((l, i) => {
        const inFm = fm;
        if (kind === 'md' && i > 0 && l === '---' && fm) fm = false;
        return (
          <div className="code-line" key={i}>
            <span>{kind === 'json' ? jsonTokens(l) : mdTokens(l, inFm && i > 0 && l !== '---')}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Rendered markdown (for our own generated output) ──
function MarkdownView({ md }) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    out.push(
      <div className="fm" key="fm">
        {lines.slice(1, end).join('\n')}
      </div>,
    );
    i = end + 1;
  }
  while (i < lines.length) {
    const l = lines[i];
    const key = `l${i}`;
    if (!l.trim() || l === '---') {
      i++;
      continue;
    }
    const h = l.match(/^(#{1,3})\s(.*)$/);
    if (h) {
      const Tag = `h${h[1].length}`;
      out.push(<Tag key={key}>{renderInline(h[2], key)}</Tag>);
      i++;
      continue;
    }
    if (l.startsWith('>')) {
      out.push(<blockquote key={key}>{renderInline(l.replace(/^>\s?/, ''), key)}</blockquote>);
      i++;
      continue;
    }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
      const [head, , ...body] = rows;
      out.push(
        <table key={key}>
          <thead>
            <tr>
              {cells(head).map((c, ci) => (
                <th key={ci}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri}>
                {cells(r).map((c, ci) => (
                  <td key={ci}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    if (/^\s*(-|\d+\.)\s/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      while (i < lines.length && /^\s*(-|\d+\.)\s/.test(lines[i])) {
        const depth = lines[i].match(/^\s*/)[0].length / 2;
        items.push(
          <li key={i} style={depth ? { marginLeft: depth * 18, listStyle: 'circle' } : undefined}>
            {renderInline(lines[i].replace(/^\s*(-|\d+\.)\s/, ''), `li${i}`)}
          </li>,
        );
        i++;
      }
      out.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
      continue;
    }
    out.push(<p key={key}>{renderInline(l, key)}</p>);
    i++;
  }
  return <div className="md-render">{out}</div>;
}

export default function PackageScreen({ doc, onBattle, onBack, notify }) {
  const [tab, setTab] = useState('rendered');
  const md = useMemo(() => toMarkdown(doc), [doc]);
  const json = useMemo(() => toJSON(doc), [doc]);
  const score = useMemo(() => readiness(doc), [doc]);
  const base = packageBaseName(doc);

  const stats = useMemo(() => {
    const r = resolveDocument(doc);
    const blocks = r.sections.flatMap((s) => s.blocks);
    return {
      sections: r.sections.length,
      keyMessages: r.sections.filter((s) => s.keyMessage && s.kind !== 'cover').length,
      visuals: blocks.filter((b) => (b.type === 'chart' && b.insight) || (b.type === 'diagram' && b.description) || (b.type === 'table' && b.summary) || ((b.type === 'visual' || b.type === 'cards') && b.description)).length,
      reviewed: doc.issues.filter((i) => i.status === 'accepted' || i.status === 'edited').length,
    };
  }, [doc]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tab === 'json' ? json : md);
      notify(`${tab === 'json' ? 'JSON' : 'Markdown'} copied to clipboard`);
    } catch {
      notify('Clipboard not available in this context');
    }
  };

  const zip = async () => {
    downloadBlob(await buildZip(doc), `${base}.zip`, 'application/zip');
    notify('AI-Ready package downloaded');
  };

  return (
    <div className="screen">
      <section className="card pkg-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span className="eyebrow">
            <Icon name="check" size={15} stroke={2.4} /> Package ready
          </span>
          <h2>{doc.meta.title} — AI-Ready edition</h2>
          <div className="muted">
            Built from <b style={{ color: 'var(--text)' }}>{doc.meta.source.name}</b>
            {score.open > 0 ? (
              <>
                {' '}
                · <span style={{ color: 'var(--warn)' }}>{score.open} finding(s) shipped as auto-drafts</span>{' '}
                <button className="btn btn-ghost btn-sm" style={{ height: 24, verticalAlign: 'middle' }} onClick={onBack}>
                  Review them
                </button>
              </>
            ) : (
              ' · every finding reviewed by the author'
            )}
          </div>
          <div className="pkg-stats">
            <div className="pkg-stat">
              <b>{stats.sections}</b>
              <span>sections, page-referenced</span>
            </div>
            <div className="pkg-stat">
              <b>{stats.keyMessages}</b>
              <span>explicit key messages</span>
            </div>
            <div className="pkg-stat">
              <b>{stats.visuals}</b>
              <span>visuals restated in text</span>
            </div>
            <div className="pkg-stat">
              <b>
                {stats.reviewed}/{doc.issues.length}
              </b>
              <span>author-validated</span>
            </div>
          </div>
        </div>
        <div className="score-duel">
          <div>
            <ScoreRing value={score.original} tone="raw" size={92} stroke={7} large />
            <div className="lbl">Original</div>
          </div>
          <Icon name="arrow" size={22} style={{ color: 'var(--text-3)' }} />
          <div>
            <ScoreRing value={score.current} size={112} stroke={8} large />
            <div className="lbl">AI-Ready</div>
          </div>
        </div>
      </section>

      <div className="pkg-layout">
        <section className="card code-card">
          <div className="code-head">
            <div className="tabs" role="tablist">
              <button className={`tab${tab === 'rendered' ? ' on' : ''}`} onClick={() => setTab('rendered')} role="tab" aria-selected={tab === 'rendered'}>
                <Icon name="eye" size={15} /> Preview
              </button>
              <button className={`tab${tab === 'md' ? ' on' : ''}`} onClick={() => setTab('md')} role="tab" aria-selected={tab === 'md'}>
                <Icon name="markdown" size={15} /> Markdown
              </button>
              <button className={`tab${tab === 'json' ? ' on' : ''}`} onClick={() => setTab('json')} role="tab" aria-selected={tab === 'json'}>
                <Icon name="braces" size={15} /> JSON
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="subtle" style={{ fontSize: 12 }}>
                {tab === 'json' ? `${base}.json · ${formatBytes(new Blob([json]).size)}` : `${base}.md · ${formatBytes(new Blob([md]).size)}`}
              </span>
              <button className="btn btn-sm" onClick={copy}>
                <Icon name="copy" size={14} /> Copy
              </button>
            </div>
          </div>
          {tab === 'rendered' ? <MarkdownView md={md} /> : <CodeView text={tab === 'json' ? json : md} kind={tab} />}
        </section>

        <aside className="side-stack">
          <button className="dl-card featured" onClick={zip}>
            <span className="dl-ico" style={{ color: 'var(--accent)' }}>
              <Icon name="zip" size={20} />
            </span>
            <span>
              <b>Full AI-Ready package</b>
              <span>.zip · Markdown + JSON + README</span>
            </span>
            <Icon name="download" size={18} />
          </button>
          <button
            className="dl-card"
            onClick={() => {
              downloadBlob(md, `${base}.md`, 'text/markdown;charset=utf-8');
              notify('Markdown downloaded');
            }}
          >
            <span className="dl-ico" style={{ color: 'var(--info)' }}>
              <Icon name="markdown" size={20} />
            </span>
            <span>
              <b>Markdown</b>
              <span>For Copilot, ChatGPT, custom GPTs</span>
            </span>
            <Icon name="download" size={18} />
          </button>
          <button
            className="dl-card"
            onClick={() => {
              downloadBlob(json, `${base}.json`, 'application/json');
              notify('JSON downloaded');
            }}
          >
            <span className="dl-ico" style={{ color: 'var(--ready)' }}>
              <Icon name="braces" size={20} />
            </span>
            <span>
              <b>Structured JSON</b>
              <span>For agents, RAG & Copilot Studio</span>
            </span>
            <Icon name="download" size={18} />
          </button>

          <div className="battle-cta">
            <h4>Prove it works</h4>
            <p>Ask the same questions to a simulated assistant fed the original PDF text vs this package.</p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={onBattle}>
              <Icon name="battle" size={16} /> Open Battle mode
            </button>
          </div>
          <div className="card card-pad" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
            <div className="field-label">How to use it</div>
            Attach the Markdown alongside the PDF when sending the proposal, or add both files to the client’s Copilot / GPT knowledge. The JSON keeps every section’s <span className="mono">source_page</span> and a <span className="mono">*_status</span> flag so agents know what the author validated.
          </div>
        </aside>
      </div>
    </div>
  );
}
