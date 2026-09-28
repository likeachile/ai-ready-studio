# Lucid · AI-Ready Proposal Studio (POC)

Turns visual proposal decks (PDF / PPTX) into an **AI-Ready package**: a hierarchical Markdown file and a structured JSON file that Copilot, custom GPTs, agents and RAG pipelines can read correctly.

## Run

```bash
npm install
npm run dev      # http://localhost:5173 (also exposed on the LAN)
npm run build    # static build in dist/
```

Everything runs in the browser. Files are never uploaded, and no AI API is called.

## Flow

1. **Upload**: drag and drop a PDF or PPTX, or open the built-in sample proposal (a fictional client, "Northwind Energy").
2. **Analyse**: real extraction, followed by heuristic detection of AI-risk zones.
3. **Review**: for each finding, you see *what an AI reads today* next to a draft *AI-Ready rewrite*. You can accept it, rewrite it or dismiss it. You can also edit titles, key messages and the executive summary.
4. **Package**: rendered preview plus Markdown and JSON source, with downloads (`.md`, `.json`, `.zip` with README).
5. **Battle**: the same question goes to a simulated assistant fed the flat PDF text and to one fed the AI-Ready package. Each answer gets accuracy, completeness and traceability scores.

## What is real vs simulated

| Part | Status |
|---|---|
| PDF extraction (pdf.js: positioned text, thumbnails, image/vector counts) | Real |
| PPTX extraction (slide XML: placeholders, bullets, native chart data, tables with merged cells, SmartArt, pictures, connectors) | Real |
| Detection of charts, diagrams, dense/merged tables, implicit key messages, multi-column layouts, icons, footnote caveats | Real, rule-based heuristics |
| Draft rewrites (chart insights computed from data, diagram descriptions, table summaries) | Rule-generated drafts for the author to confirm |
| AI-readability score | Heuristic indicator |
| Battle-mode answers | Simulated: curated Q&A for the sample, retrieval-based answers for uploaded files |

Legacy `.ppt` files are rejected with guidance (save as `.pptx` or export to PDF).

## Structure

```
src/
  lib/extract/pdf.js, pptx.js   extraction
  lib/analyze.js                structure rebuild + issue detection
  lib/model.js                  document model, applies review decisions, scoring
  lib/export.js                 Markdown / JSON / ZIP
  lib/simulate.js               simulated LLM for Battle mode
  lib/sample.js                 demo deck + curated Q&A
  components/                   screens (Upload, Processing, Review, Package, Battle) + SlidePreview
```

Review decisions never mutate the source. `resolveDocument()` derives the final content from each issue's status. In the JSON, each field carries a `*_status` (`source`, `reviewed`, `author` or `auto-draft`) so downstream agents know what the author validated.
