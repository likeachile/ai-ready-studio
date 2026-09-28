import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeExtraction } from './lib/analyze.js';
import { buildSampleDocument } from './lib/sample.js';
import TopBar from './components/TopBar.jsx';
import UploadScreen from './components/UploadScreen.jsx';
import ProcessingScreen from './components/ProcessingScreen.jsx';
import ReviewScreen from './components/ReviewScreen.jsx';
import PackageScreen from './components/PackageScreen.jsx';
import BattleScreen from './components/BattleScreen.jsx';
import { Toast } from './components/ui.jsx';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const VISUAL_TYPES = new Set(['chart', 'diagram', 'table', 'cards', 'kpis', 'visual']);

export default function App() {
  const [stage, setStage] = useState('upload');
  const [doc, setDoc] = useState(null);
  const [proc, setProc] = useState(null);
  const [error, setError] = useState('');
  const [rounds, setRounds] = useState([]);
  const [toast, setToast] = useState('');
  const run = useRef(0);

  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(notify.t);
    notify.t = setTimeout(() => setToast(''), 2400);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [stage]);

  /** Plays the analysis steps after extraction so the user sees what was found. */
  async function finishAnalysis(token, newDoc) {
    const visuals = newDoc.sections.flatMap((s) => s.blocks).filter((b) => VISUAL_TYPES.has(b.type)).length;
    const steps = [
      { step: 2, progress: 0.72, stats: { visuals } },
      { step: 3, progress: 0.86, stats: { visuals, issues: newDoc.issues.length } },
      { step: 4, progress: 0.96, stats: { visuals, issues: newDoc.issues.length } },
      { step: 5, progress: 1, stats: { visuals, issues: newDoc.issues.length } },
    ];
    for (const s of steps) {
      await wait(620);
      if (run.current !== token) return;
      setProc((p) => ({ ...p, ...s, stats: { ...p.stats, ...s.stats } }));
    }
    await wait(450);
    if (run.current !== token) return;
    setDoc(newDoc);
    setRounds([]);
    setStage('review');
  }

  async function handleFile(file) {
    setError('');
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'ppt') return setError('Legacy .ppt files can’t be read in the browser. Save the deck as .pptx, or export it to PDF, and drop it again.');
    if (!['pdf', 'pptx'].includes(ext)) return setError(`“${file.name}” isn’t a PDF or PowerPoint file.`);
    if (file.size > 80 * 1024 * 1024) return setError('This file is over 80 MB — please compress images or split the deck.');

    const token = ++run.current;
    setStage('processing');
    setProc({ name: file.name, step: 0, progress: 0.03, previews: [], stats: { pages: 0 } });
    try {
      const { extractPdf } = ext === 'pdf' ? await import('./lib/extract/pdf.js') : {};
      const { extractPptx } = ext === 'pptx' ? await import('./lib/extract/pptx.js') : {};
      const onProgress = (p, page) =>
        run.current === token &&
        setProc((s) => ({
          ...s,
          step: p < 0.5 ? 0 : 1,
          progress: 0.05 + p * 0.6,
          previews: page?.thumbnail ? [...s.previews, { key: page.index, src: page.thumbnail }].slice(-4) : s.previews,
          stats: { ...s.stats, pages: page?.index ?? s.stats.pages },
        }));
      const extracted = ext === 'pdf' ? await extractPdf(file, onProgress) : await extractPptx(file, onProgress);
      if (run.current !== token) return;
      if (!extracted.pages.length) throw new Error('No pages found in this file.');
      const newDoc = analyzeExtraction(extracted);
      if (ext === 'pptx') setProc((s) => ({ ...s, previews: newDoc.sections.slice(-3).map((sec) => ({ key: sec.id, section: sec })) }));
      await finishAnalysis(token, newDoc);
    } catch (e) {
      console.error(e);
      if (run.current !== token) return;
      setError(/password/i.test(e?.message) ? 'This PDF is password-protected. Remove the protection and try again.' : `We couldn’t read this file (${e?.message || 'unknown error'}).`);
      setStage('upload');
    }
  }

  async function handleSample() {
    setError('');
    const token = ++run.current;
    const sample = buildSampleDocument();
    setStage('processing');
    setProc({ name: sample.meta.source.name, step: 0, progress: 0.03, previews: [], stats: { pages: 0 } });
    for (let i = 0; i < sample.sections.length; i++) {
      await wait(260);
      if (run.current !== token) return;
      const sec = sample.sections[i];
      setProc((s) => ({
        ...s,
        step: i < sample.sections.length / 2 ? 0 : 1,
        progress: 0.05 + ((i + 1) / sample.sections.length) * 0.6,
        previews: [...s.previews, { key: sec.id, section: sec }].slice(-4),
        stats: { ...s.stats, pages: i + 1 },
      }));
    }
    await finishAnalysis(token, sample);
  }

  const reset = () => {
    run.current++;
    setStage('upload');
    setDoc(null);
    setProc(null);
    setRounds([]);
  };

  const updateIssue = (id, patch) => setDoc((d) => ({ ...d, issues: d.issues.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const updateSection = (id, patch) => setDoc((d) => ({ ...d, sections: d.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const updateDoc = (patch) => setDoc((d) => ({ ...d, ...patch }));
  const acceptAll = () => {
    const n = doc.issues.filter((i) => i.status === 'open').length;
    setDoc((d) => ({ ...d, issues: d.issues.map((i) => (i.status === 'open' ? { ...i, status: 'accepted' } : i)) }));
    notify(`${n} draft${n === 1 ? '' : 's'} accepted`);
  };

  return (
    <div className="app">
      <TopBar stage={stage} hasDoc={!!doc} fileName={stage === 'processing' ? proc?.name : doc?.meta.source.name} onNavigate={setStage} onReset={reset} />
      <main className="main">
        {stage === 'upload' && <UploadScreen onFile={handleFile} onSample={handleSample} error={error} />}
        {stage === 'processing' && proc && <ProcessingScreen proc={proc} />}
        {stage === 'review' && doc && <ReviewScreen doc={doc} onIssueUpdate={updateIssue} onSectionUpdate={updateSection} onDocUpdate={updateDoc} onAcceptAll={acceptAll} onContinue={() => setStage('package')} />}
        {stage === 'package' && doc && <PackageScreen doc={doc} onBattle={() => setStage('battle')} onBack={() => setStage('review')} notify={notify} />}
        {stage === 'battle' && doc && <BattleScreen doc={doc} rounds={rounds} setRounds={setRounds} />}
      </main>
      <Toast message={toast} />
    </div>
  );
}
