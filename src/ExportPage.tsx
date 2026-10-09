import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { download, exportDraft } from "./pdf";
import { isApproved, type DocumentRef, type SemanticField } from "./domain";
const PdfViewer = lazy(() => import("./PdfViewer"));
type Format = "pdf" | "docx";
export default function ExportPage({ current, target, fields, documents, revisionKey, onBack, onProject }: {
  current: boolean; target: DocumentRef; fields: SemanticField[]; documents: DocumentRef[]; revisionKey: string; onBack: () => void; onProject: () => void;
}) {
  const [format, setFormat] = useState<Format>(); const [artifact, setArtifact] = useState<{ format: Format; key: string; bytes: Uint8Array }>();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [page, setPage] = useState(1);
  const generation = useRef(0); const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);
  useEffect(() => { generation.current++; setArtifact(undefined); setFormat(undefined); setError(""); setBusy(false); }, [revisionKey]);
  async function choose(next: Format) {
    if (!current) return;
    const ticket = ++generation.current; setFormat(next); setArtifact(undefined); setBusy(true); setError(""); setPage(1);
    try {
      const bytes = next === "pdf" ? await exportDraft(target, fields) : await (await import("./word")).exportWord(target, fields, documents);
      if (alive.current && ticket === generation.current) setArtifact({ format: next, key: revisionKey, bytes });
    } catch (e) { if (alive.current && ticket === generation.current) setError(e instanceof Error ? e.message : "Export could not be generated. Select the format to retry."); }
    finally { if (alive.current && ticket === generation.current) setBusy(false); }
  }
  const ready = current && artifact?.key === revisionKey && artifact.format === format;
  return <section className="export-page">
    <div className="stage-heading"><h1 tabIndex={-1}>How would you like to export your document?</h1><p>Your information was reviewed by you. Choose a file type to prepare the download.</p></div>
    <div className="export-layout"><div className="export-document">{busy ? <p role="status" className="loading-text">Preparing your {format === "docx" ? "Word document" : "PDF"}…</p> : error ? <div role="alert" className="error-box">{error}<button className="text-button" onClick={() => format && void choose(format)}>Retry export</button></div> : ready && artifact ? format === "pdf" ? <Suspense fallback={<p role="status">Opening PDF preview…</p>}><PdfViewer bytes={artifact.bytes} page={page} onPage={setPage} /></Suspense> : <section className="word-content-preview" aria-label="Word content preview"><h2>Content preview</h2><p>This shows the exported information. Word controls final pagination and layout.</p><h3>{target.name}</h3><dl>{fields.filter(isApproved).map((f) => <div key={f.id}><dt>{f.label}</dt><dd>{f.value || "Not provided — explicitly left blank"}{f.source && <blockquote>{f.source.quote}<cite>{documents.find((d) => d.id === f.source!.documentId)?.name}, page {f.source.page}</cite></blockquote>}</dd></div>)}</dl></section> : <div className="export-empty"><h2>Choose your file type.</h2><p>{target.name}</p><p>The PDF preserves the available original form layout. Word gives you an editable answer document.</p></div>}</div>
      <aside className="export-summary"><fieldset className="export-formats"><legend>File type</legend><label><input type="radio" name="export-format" value="pdf" checked={format === "pdf"} onChange={() => void choose("pdf")} /><span><strong>PDF</strong><small>{target.support === "plain" ? "Separate answer sheet (.pdf)" : "Filled form and review summary (.pdf)"}</small></span></label><label><input type="radio" name="export-format" value="docx" checked={format === "docx"} onChange={() => void choose("docx")} /><span><strong>Word</strong><small>Editable answer document (.docx)</small></span></label></fieldset>
        <p>{fields.filter((f) => isApproved(f) && !!f.value).length} answers included. {fields.filter((f) => isApproved(f) && !f.value).length} explicitly left blank.</p>
        <button className="button primary" disabled={!ready || busy} onClick={() => artifact && download(artifact.bytes, `PapelLess-${format === "pdf" ? "draft.pdf" : "answers.docx"}`, format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}><Download size={17} /> {format === "docx" ? "Download Word" : "Download PDF"}</button><button className="button secondary" onClick={onBack}><ArrowLeft size={16} /> Back to verification</button><p>Not signed or submitted.</p><hr /><h3>Keep your work</h3><p>A project file contains answers and conversation, but not PDFs.</p><button className="text-button" onClick={onProject}>Download project file</button>
      </aside></div>
  </section>;
}