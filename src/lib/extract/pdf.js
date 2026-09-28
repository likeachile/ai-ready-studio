// PDF extraction with pdf.js: positioned text runs, a page thumbnail, and counts of images / vector
// paths (a strong signal that a page is a diagram or chart). Loaded lazily to keep the first paint light.

const MAX_PAGES = 40;

export async function extractPdf(file, onProgress = () => {}) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const count = Math.min(pdf.numPages, MAX_PAGES);
  const { OPS } = pdfjs;
  const imageOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat].filter(Boolean));

  let info = {};
  try {
    info = (await pdf.getMetadata())?.info || {};
  } catch {
    /* metadata is optional */
  }

  const pages = [];
  for (let n = 1; n <= count; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        w: it.width,
        size: Math.round(Math.hypot(it.transform[2], it.transform[3]) * 10) / 10 || it.height || 10,
      }));

    let imageCount = 0;
    let pathCount = 0;
    try {
      const ops = await page.getOperatorList();
      for (const fn of ops.fnArray) {
        if (imageOps.has(fn)) imageCount++;
        else if (fn === OPS.constructPath) pathCount++;
      }
    } catch {
      /* operator list is best effort */
    }

    const thumbnail = await renderThumbnail(page, viewport);
    pages.push({
      index: n,
      width: viewport.width,
      height: viewport.height,
      items,
      rawText: items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim(),
      imageCount,
      pathCount,
      thumbnail,
    });
    page.cleanup();
    onProgress(n / count, pages[pages.length - 1]);
  }

  return {
    type: 'pdf',
    name: file.name,
    size: file.size,
    totalPages: pdf.numPages,
    title: info.Title || '',
    author: info.Author || '',
    pages,
  };
}

async function renderThumbnail(page, viewport) {
  if (typeof document === 'undefined') return null;
  try {
    const scale = 560 / viewport.width;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, canvas }).promise;
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return null;
  }
}
