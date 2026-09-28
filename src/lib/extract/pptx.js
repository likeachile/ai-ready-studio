// PPTX extraction straight from the Open XML package: placeholders, text boxes with bullet levels,
// real table grids (incl. merged cells), native chart series, SmartArt node text, pictures, alt text
// and connectors. This is far richer than what a PDF export exposes.

const MAX_SLIDES = 60;
const EMU = 12700; // EMU per point

const els = (node, name) => (node ? Array.from(node.getElementsByTagNameNS('*', name)) : []);
const el = (node, name) => els(node, name)[0] || null;
const kids = (node, name) => Array.from(node?.children || []).filter((c) => !name || c.localName === name);
const texts = (node) => els(node, 't').map((t) => t.textContent).join('');

function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

async function readXml(zip, path) {
  const f = zip.file(path);
  if (!f) return null;
  return new DOMParser().parseFromString(await f.async('text'), 'application/xml');
}

async function readRels(zip, partPath) {
  const dir = partPath.split('/').slice(0, -1).join('/');
  const file = partPath.split('/').pop();
  const xml = await readXml(zip, `${dir}/_rels/${file}.rels`);
  const map = {};
  for (const r of els(xml, 'Relationship')) map[r.getAttribute('Id')] = resolvePath(partPath, r.getAttribute('Target'));
  return map;
}

const rid = (node, local) => {
  if (!node) return null;
  for (const a of Array.from(node.attributes)) if (a.localName === local) return a.value;
  return null;
};

export async function extractPptx(file, onProgress = () => {}) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const pres = await readXml(zip, 'ppt/presentation.xml');
  if (!pres) throw new Error('This file is not a valid PowerPoint (.pptx) package.');
  const presRels = await readRels(zip, 'ppt/presentation.xml');
  const sz = el(pres, 'sldSz');
  const slideW = (+sz?.getAttribute('cx') || 12192000) / EMU;
  const slideH = (+sz?.getAttribute('cy') || 6858000) / EMU;

  let slidePaths = els(pres, 'sldId').map((s) => presRels[rid(s, 'id')]).filter(Boolean);
  if (!slidePaths.length) {
    slidePaths = Object.keys(zip.files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  }
  slidePaths = slidePaths.slice(0, MAX_SLIDES);

  const core = await readXml(zip, 'docProps/core.xml');
  const pages = [];
  for (let i = 0; i < slidePaths.length; i++) {
    pages.push(await extractSlide(zip, slidePaths[i], i + 1, slideW, slideH));
    onProgress((i + 1) / slidePaths.length, pages[i]);
  }

  return {
    type: 'pptx',
    name: file.name,
    size: file.size,
    totalPages: slidePaths.length,
    title: el(core, 'title')?.textContent || '',
    author: el(core, 'creator')?.textContent || '',
    pages,
  };
}

async function extractSlide(zip, path, index, slideW, slideH) {
  const xml = await readXml(zip, path);
  const rels = await readRels(zip, path);
  const out = {
    index,
    width: slideW,
    height: slideH,
    texts: [],
    tables: [],
    charts: [],
    smartArt: [],
    pictures: 0,
    altTexts: [],
    connectors: 0,
    groups: 0,
    raw: [],
  };
  const tree = el(xml, 'spTree');
  await walk(tree, false);

  async function walk(node, inGroup) {
    for (const child of kids(node)) {
      const name = child.localName;
      if (name === 'sp') readShape(child, inGroup);
      else if (name === 'grpSp') {
        out.groups++;
        await walk(child, true);
      } else if (name === 'cxnSp') out.connectors++;
      else if (name === 'pic') {
        out.pictures++;
        const alt = el(child, 'cNvPr')?.getAttribute('descr');
        if (alt) out.altTexts.push(alt);
      } else if (name === 'graphicFrame') await readFrame(child);
      else if (name === 'AlternateContent') await walk(el(child, 'Choice') || el(child, 'Fallback') || child, inGroup);
    }
  }

  function readShape(sp, inGroup) {
    const ph = el(el(sp, 'nvPr'), 'ph');
    const placeholder = ph ? ph.getAttribute('type') || 'body' : null;
    const body = el(sp, 'txBody');
    if (!body) return;
    const paragraphs = kids(body, 'p')
      .map((p) => {
        const pPr = el(p, 'pPr');
        const sizes = els(p, 'rPr').map((r) => +r.getAttribute('sz') || 0).filter(Boolean);
        return {
          text: texts(p).replace(/\s+/g, ' ').trim(),
          level: +(pPr?.getAttribute('lvl') || 0),
          bullet: !!(el(pPr, 'buChar') || el(pPr, 'buAutoNum')) || placeholder === 'body',
          size: sizes.length ? Math.max(...sizes) / 100 : null,
        };
      })
      .filter((p) => p.text);
    if (!paragraphs.length) return;
    const off = el(el(sp, 'xfrm'), 'off');
    const ext = el(el(sp, 'xfrm'), 'ext');
    const shape = {
      placeholder,
      inGroup,
      paragraphs,
      text: paragraphs.map((p) => p.text).join('\n'),
      x: (+off?.getAttribute('x') || 0) / EMU,
      y: (+off?.getAttribute('y') || 0) / EMU,
      w: (+ext?.getAttribute('cx') || 0) / EMU,
      h: (+ext?.getAttribute('cy') || 0) / EMU,
    };
    out.texts.push(shape);
    out.raw.push(paragraphs.map((p) => p.text).join(' '));
  }

  async function readFrame(frame) {
    const data = el(frame, 'graphicData');
    const uri = data?.getAttribute('uri') || '';
    if (uri.endsWith('/table')) {
      const table = readTable(el(data, 'tbl'));
      out.tables.push(table);
      out.raw.push(table.rawRows.map((r) => r.filter(Boolean).join(' ')).join(' '));
    } else if (uri.endsWith('/chart')) {
      const target = rels[rid(el(data, 'chart'), 'id')];
      const chart = target ? readChart(await readXml(zip, target)) : null;
      if (chart) {
        out.charts.push(chart);
        out.raw.push(chart.title || '');
      }
    } else if (uri.endsWith('/diagram')) {
      const target = rels[rid(el(data, 'relIds'), 'dm')];
      const dm = target ? await readXml(zip, target) : null;
      const nodes = els(dm, 'pt')
        .filter((pt) => !['parTrans', 'sibTrans', 'pres'].includes(pt.getAttribute('type')) && pt.getAttribute('type') !== 'doc')
        .map((pt) => texts(pt).trim())
        .filter(Boolean);
      if (nodes.length) {
        out.smartArt.push({ nodes });
        out.raw.push(nodes.join(' '));
      }
    }
  }

  return { ...out, rawText: out.raw.join(' ').replace(/\s+/g, ' ').trim() };
}

function readTable(tbl) {
  const rawRows = [];
  let merged = false;
  const grid = [];
  els(tbl, 'tr').forEach((tr, r) => {
    const row = [];
    const raw = [];
    kids(tr, 'tc').forEach((tc, c) => {
      const txt = texts(tc).replace(/\s+/g, ' ').trim();
      const vMerge = tc.getAttribute('vMerge') === '1';
      const hMerge = tc.getAttribute('hMerge') === '1';
      if (vMerge || hMerge || +tc.getAttribute('gridSpan') > 1 || +tc.getAttribute('rowSpan') > 1) merged = true;
      raw.push(vMerge || hMerge ? '' : txt);
      // Fill merged continuations so every record is self-contained.
      if (vMerge) row.push(grid[r - 1]?.[c] ?? '');
      else if (hMerge) row.push(row[c - 1] ?? '');
      else row.push(txt);
    });
    grid.push(row);
    rawRows.push(raw);
  });
  return { rows: grid, rawRows, merged };
}

function readChart(xml) {
  if (!xml) return null;
  const plot = el(xml, 'plotArea');
  const typeNode = kids(plot).find((k) => /Chart$/.test(k.localName));
  if (!typeNode) return null;
  const kind = typeNode.localName.replace(/3D/, '').replace('Chart', '');
  const barDir = el(typeNode, 'barDir')?.getAttribute('val');
  const chartType = kind === 'doughnut' ? 'donut' : kind === 'bar' ? (barDir === 'bar' ? 'hbar' : 'bar') : kind;
  const titleNode = el(el(xml, 'chart'), 'title');
  const title = titleNode ? texts(titleNode).trim() : '';
  const pts = (node) =>
    els(node, 'pt')
      .sort((a, b) => +a.getAttribute('idx') - +b.getAttribute('idx'))
      .map((p) => el(p, 'v')?.textContent ?? '');
  let categories = [];
  const series = els(plot, 'ser').map((ser, i) => {
    const tx = el(ser, 'tx');
    const name = (tx && (el(tx, 'v')?.textContent || texts(tx))) || `Series ${i + 1}`;
    const cats = pts(el(ser, 'cat'));
    if (cats.length > categories.length) categories = cats;
    return { name: name.trim(), values: pts(el(ser, 'val')).map(Number) };
  });
  if (!series.length) return null;
  if (!categories.length) categories = series[0].values.map((_, i) => `#${i + 1}`);
  const fmt = el(plot, 'numFmt')?.getAttribute('formatCode') || '';
  return { chartType, title, categories, series, unit: fmt.includes('%') ? '%' : '' };
}
