// Renders a section of the document model as a miniature slide. Used for the sample deck and PPTX
// uploads (no raster thumbnail), and to highlight the block an issue refers to.

const PALETTE = ['#2e2e38', '#ffe600', '#8a8a96', '#c9c9cf', '#55555f', '#e0cf3c', '#b0b0b8'];

function BarChart({ b }) {
  const s = b.series?.length ? b.series : [{ name: '', values: (b.values || []).map((v) => parseFloat(String(v).replace(/[^\d.-]/g, '')) || 0) }];
  const cats = b.categories?.length ? b.categories : s[0].values.map((_, i) => b.labels?.[i] || '');
  const max = Math.max(...s.flatMap((x) => x.values), 1);
  const W = 400;
  const H = 210;
  const n = cats.length;
  const groupW = W / n;
  const barW = Math.min(64, (groupW * 0.62) / s.length);
  return (
    <svg viewBox={`0 -26 ${W} ${H + 56}`}>
      <line x1="0" x2={W} y1={H} y2={H} stroke="#bbb" strokeWidth="1" />
      {cats.map((c, ci) =>
        s.map((ser, si) => {
          const v = ser.values[ci] ?? 0;
          const h = (v / max) * (H - 10);
          const x = ci * groupW + groupW / 2 - (barW * s.length) / 2 + si * barW;
          return (
            <g key={`${ci}-${si}`}>
              <rect x={x + 2} y={H - h} width={barW - 4} height={h} rx="2" fill={s.length > 1 ? PALETTE[si % PALETTE.length] : ci === 0 ? '#2e2e38' : '#a4a4ae'} />
              <text x={x + barW / 2} y={H - h - 7} textAnchor="middle" fontSize="15" fontWeight="700" fill="#222">
                {v}
                {b.unit === '%' ? '%' : ''}
              </text>
            </g>
          );
        }),
      )}
      {cats.map((c, ci) => (
        <text key={c + ci} x={ci * groupW + groupW / 2} y={H + 22} textAnchor="middle" fontSize="13" fill="#555">
          {String(c).slice(0, 18)}
        </text>
      ))}
    </svg>
  );
}

function LineChart({ b }) {
  const W = 400;
  const H = 200;
  const all = b.series.flatMap((s) => s.values);
  const max = Math.max(...all, 1);
  const min = Math.min(...all, 0);
  const x = (i) => (i / Math.max(1, b.categories.length - 1)) * (W - 20) + 10;
  const y = (v) => H - ((v - min) / (max - min || 1)) * (H - 20);
  return (
    <svg viewBox={`0 -10 ${W} ${H + 40}`}>
      <line x1="0" x2={W} y1={H} y2={H} stroke="#bbb" />
      {b.series.map((s, si) => (
        <polyline key={si} fill="none" stroke={PALETTE[si % PALETTE.length]} strokeWidth="3" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
      ))}
      {b.categories.map((c, i) => (
        <text key={i} x={x(i)} y={H + 22} textAnchor="middle" fontSize="12" fill="#555">
          {String(c).slice(0, 10)}
        </text>
      ))}
    </svg>
  );
}

function Donut({ b }) {
  const vals = b.series[0].values;
  const total = vals.reduce((a, v) => a + v, 0) || 1;
  let acc = 0;
  const R = 80;
  const r = 48;
  const arcs = vals.map((v, i) => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += v;
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad, ang) => `${100 + rad * Math.cos(ang)},${100 + rad * Math.sin(ang)}`;
    const mid = (a0 + a1) / 2;
    return {
      d: `M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${large} 0 ${p(r, a0)} Z`,
      color: PALETTE[i % PALETTE.length],
      pct: Math.round((v / total) * 100),
      lx: 100 + ((R + r) / 2) * Math.cos(mid),
      ly: 100 + ((R + r) / 2) * Math.sin(mid),
      dark: i % PALETTE.length === 0 || i % PALETTE.length === 4,
    };
  });
  return (
    <svg viewBox="0 0 360 200">
      {arcs.map((a, i) => (
        <g key={i}>
          <path d={a.d} fill={a.color} stroke="#f7f7f4" strokeWidth="2" />
          <text x={a.lx} y={a.ly + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={a.dark ? '#fff' : '#222'}>
            {a.pct}%
          </text>
        </g>
      ))}
      {b.categories.map((c, i) => (
        <g key={c} transform={`translate(215 ${40 + i * 26})`}>
          <rect width="12" height="12" rx="2" fill={PALETTE[i % PALETTE.length]} />
          <text x="20" y="11" fontSize="13" fill="#444">
            {String(c).slice(0, 16)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function ChartBlock({ b }) {
  const hasSeries = b.series?.length && b.categories?.length;
  return (
    <div className="s-chart" style={{ display: 'flex', flexDirection: 'column' }}>
      {b.title && <div style={{ fontSize: '1.5cqw', fontWeight: 650, marginBottom: '0.8cqw', color: '#333' }}>{b.title}</div>}
      <div style={{ flex: 1, minHeight: 0 }}>
        {hasSeries && (b.chartType === 'donut' || b.chartType === 'pie') ? <Donut b={b} /> : hasSeries && (b.chartType === 'line' || b.chartType === 'area') ? <LineChart b={b} /> : <BarChart b={b} />}
      </div>
    </div>
  );
}

function levels(nodes, edges) {
  const incoming = new Map(nodes.map((n) => [n.id, 0]));
  const fwd = edges.filter(([, , l]) => !/escalat|report/i.test(l || ''));
  for (const [, t] of fwd) incoming.set(t, (incoming.get(t) || 0) + 1);
  const lvl = new Map();
  const queue = nodes.filter((n) => !incoming.get(n.id)).map((n) => [n.id, 0]);
  while (queue.length) {
    const [id, l] = queue.shift();
    if (lvl.has(id)) continue;
    lvl.set(id, l);
    for (const [f, t] of fwd) if (f === id && !lvl.has(t)) queue.push([t, l + 1]);
  }
  const rows = [];
  nodes.forEach((n) => {
    const l = lvl.get(n.id) ?? 0;
    (rows[l] ||= []).push(n);
  });
  return rows.filter(Boolean);
}

function DiagramBlock({ b }) {
  if (b.diagramType === 'process') {
    return (
      <div className="s-diagram" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1.6cqw' }}>
        <div style={{ display: 'flex', gap: '0.5cqw' }}>
          {b.nodes.map((n, i) => (
            <div key={n.id} style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  background: i % 2 ? '#55555f' : '#2e2e38',
                  color: '#fff',
                  fontWeight: 650,
                  fontSize: '1.7cqw',
                  padding: '1.6cqw 1cqw 1.6cqw 2.4cqw',
                  clipPath: i === 0 ? 'polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%)' : 'polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%, 12% 50%)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {n.label}
              </div>
              {n.detail && <div style={{ fontSize: '1.25cqw', color: '#555', marginTop: '1cqw', paddingRight: '1cqw', lineHeight: 1.35 }}>{n.detail}</div>}
            </div>
          ))}
        </div>
        {b.edges?.some((e) => e[2]) && (
          <div style={{ display: 'flex', gap: '0.5cqw', paddingLeft: '8%' }}>
            {b.edges.map((e, i) => (
              <div key={i} style={{ flex: 1, fontSize: '1.1cqw', color: '#777', display: 'flex', gap: '0.6cqw', alignItems: 'center' }}>
                <span style={{ width: '1.2cqw', height: '1.2cqw', background: '#ffe600', transform: 'rotate(45deg)', flex: 'none' }} />
                {e[2]}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  const rows = b.diagramType === 'hierarchy' && b.edges?.length ? levels(b.nodes, b.edges) : chunk(b.nodes, Math.ceil(Math.sqrt(b.nodes.length * 1.8)));
  return (
    <div className="s-diagram" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1.4cqw' }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', justifyContent: 'center', gap: '1.2cqw' }}>
          {row.map((n) => (
            <div
              key={n.id}
              style={{
                flex: `0 1 ${Math.min(34, 88 / row.length)}%`,
                background: ri === 0 && b.diagramType === 'hierarchy' ? '#2e2e38' : '#fff',
                color: ri === 0 && b.diagramType === 'hierarchy' ? '#fff' : '#222',
                border: '1px solid #d8d8d2',
                borderTop: ri === 0 ? '0.4cqw solid #ffe600' : '1px solid #d8d8d2',
                borderRadius: '0.6cqw',
                padding: '1cqw 1.2cqw',
                boxShadow: '0 0.2cqw 0.6cqw rgba(0,0,0,.06)',
              }}
            >
              <div style={{ fontSize: '1.45cqw', fontWeight: 650, lineHeight: 1.2 }}>{n.label}</div>
              {n.detail && <div style={{ fontSize: '1.1cqw', opacity: 0.7, marginTop: '0.4cqw', lineHeight: 1.3 }}>{n.detail}</div>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const chunk = (arr, n) => arr.reduce((rows, x, i) => (i % n ? rows[rows.length - 1].push(x) : rows.push([x]), rows), []);

function TableBlock({ b }) {
  const rows = b.rows.slice(0, 8);
  return (
    <div style={{ overflow: 'hidden', height: '100%' }}>
      <table className="s-table">
        <thead>
          <tr>
            {b.columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {b.columns.map((_, ci) => (
                <td key={ci} className={b.merged && ci === 0 && ri > 0 && r[0] === rows[ri - 1][0] ? 'merged' : ''}>
                  {r[ci]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Block({ b, single }) {
  switch (b.type) {
    case 'text':
      return <div className={`s-text${single || b.text.split(' ').length <= 8 ? ' big' : ''}`}>{b.text}</div>;
    case 'bullets':
      return (
        <ul className="s-bullets">
          {b.items.slice(0, 9).map((i, k) => (
            <li key={k} style={{ marginLeft: `${(i.level || 0) * 2}cqw` }}>
              {i.text}
            </li>
          ))}
        </ul>
      );
    case 'cards':
      return (
        <div className="s-cards">
          {b.items.map((c) => (
            <div className="s-card" key={c.title}>
              <div className="s-ic">{c.icon}</div>
              <b>{c.title}</b>
              <span>{c.text}</span>
            </div>
          ))}
        </div>
      );
    case 'kpis':
      return (
        <div className="s-kpis">
          {b.items.slice(0, 6).map((k, i) => (
            <div className="s-kpi" key={i}>
              <b>{k.value}</b>
              <span>{k.label}</span>
              {k.context && <em>{k.context}</em>}
            </div>
          ))}
        </div>
      );
    case 'chart':
      return <ChartBlock b={b} />;
    case 'diagram':
      return <DiagramBlock b={b} />;
    case 'table':
      return <TableBlock b={b} />;
    case 'visual':
      return <div className="s-visual">Image</div>;
    default:
      return null;
  }
}

export default function SlidePreview({ section, highlightBlockId, total, footLabel = "", className = "" }) {
  if (!section) return null;
  const main = section.blocks.filter((b) => !b.small);
  const foot = section.blocks.filter((b) => b.small);
  if (section.kind === 'cover') {
    return (
      <div className={`slide cover ${className}`}>
        <div className="slide-inner">
          <div className="slide-accent" />
          <div className="slide-title">{section.title}</div>
          {main.map((b) => b.type === 'text' && <div key={b.id} className="s-text">{b.text}</div>)}
        </div>
      </div>
    );
  }
  const hasProse = main.some((b) => b.type === 'text' || b.type === 'bullets');
  const row = !hasProse && main.length > 1;
  return (
    <div className={`slide ${className}`}>
      <div className="slide-inner">
        <div className="slide-accent" />
        <div className="slide-title">{section.title}</div>
        <div className={`slide-body${row ? '' : ' col'}`}>
          {main.map((b) => (
            <div key={b.id} className={`sb${b.id === highlightBlockId ? ' hl' : ''}`} style={row && b.type === 'kpis' ? { flex: 0.7 } : hasProse && (b.type === 'text' || b.type === 'bullets') ? { flex: 'none' } : undefined}>
              <Block b={b} single={main.length === 1} />
            </div>
          ))}
        </div>
        {foot.map((b) => (
          <div key={b.id} className={`slide-foot-note${b.id === highlightBlockId ? ' sb hl' : ''}`} style={{ flex: 'none' }}>
            {b.text}
          </div>
        ))}
      </div>
      <div className="slide-foot">
        <span>{footLabel}</span>
        <span>
          {section.page}
          {total ? ` / ${total}` : ''}
        </span>
      </div>
    </div>
  );
}
