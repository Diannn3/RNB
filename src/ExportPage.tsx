import { lazy, Suspense, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { download } from "./pdf";
import { isApproved, type DocumentRef, type SemanticField } from "./domain";
const PdfViewer = lazy(() => import("./PdfViewer"));
export default function ExportPage({ bytes, current, target, fields, onBack, onPrepare, onProject }: {
  bytes?: Uint8Array; current: boolean; target: DocumentRef; fields: SemanticField[];
  onBack: () => void; onPrepare: () => void; onProject: () => void;
}) {
  const [page, setPage] = useState(1);
  const unresolved = fields.filter((f) => !isApproved(f));
  return <section className="export-page">
    <div className="stage-heading"><h1 tabIndex={-1}>{current ? "Your draft is ready." : "Prepare your latest draft."}</h1><p>{target.support === "plain" ? "Separate answer sheet" : "Form draft with review summary"} · Not signed or submitted.</p></div>
    <div className="export-layout"><div className="export-document">{bytes && current ? <Suspense fallback={<p role="status">Opening final preview…</p>}><PdfViewer bytes={bytes} page={page} onPage={setPage} /></Suspense> : <div className="export-stale"><h2>This draft needs to be generated.</h2><p>Answers or review state may have changed. Return to verification before downloading.</p><button className="button primary" onClick={onPrepare}>Prepare latest draft</button></div>}</div>
    <aside className="export-summary"><h2>{unresolved.length ? "Incomplete draft" : "Reviewed draft"}</h2><p>{fields.filter(isApproved).length} reviewed answers included. {unresolved.length} entries remain unreviewed.</p>{!!unresolved.length && <><h3>Left blank</h3><ul>{unresolved.map((f) => <li key={f.id}>{f.label}{f.kind === "unsupported" ? " — unsupported, left unchanged" : ""}</li>)}</ul></>}<button className="button primary" disabled={!bytes || !current} onClick={() => download(bytes!, "PapelLess-draft.pdf", "application/pdf")}><Download size={17} /> Download draft</button><button className="button secondary" onClick={onBack}><ArrowLeft size={16} /> Back to verification</button><hr /><h3>Keep your work</h3><p>A project file includes answers and conversation, but not PDFs. Keep the originals to resume.</p><button className="text-button" onClick={onProject}>Download project file</button></aside></div>
  </section>;
}
