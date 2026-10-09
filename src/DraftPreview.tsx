import { lazy, Suspense, useEffect, useState } from "react";
import type { DocumentRef, SemanticField } from "./domain";
import { exportDraft } from "./pdf";
const PdfViewer = lazy(() => import("./PdfViewer"));
export default function DraftPreview({ target, fields }: { target: DocumentRef; fields: SemanticField[] }) {
  const [artifact, setArtifact] = useState<{ key: string; bytes: Uint8Array }>();
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const key = JSON.stringify([target.hash, fields]);
  useEffect(() => {
    let current = true;
    setError("");
    const timer = setTimeout(() => {
      void exportDraft(target, fields, "working").then((bytes) => {
        if (current) { setArtifact({ key, bytes }); setPage(1); }
      }).catch((e: unknown) => { if (current) setError(e instanceof Error ? e.message : "Preview could not be prepared. Change an answer to retry."); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [key]);
  return <section className="working-preview" aria-label="Working draft preview">
    <div className="pane-heading"><strong>{target.support === "plain" ? "Answer sheet preview" : "Working draft preview"}</strong></div>
    <p className="preview-note">Current edits are shown here. Only reviewed answers enter the final export.</p>
    {error ? <p role="alert" className="error-box">{error}</p> : artifact?.key === key ? <Suspense fallback={<p role="status">Opening preview…</p>}><PdfViewer bytes={artifact.bytes} page={page} onPage={setPage} /></Suspense> : <p role="status" className="loading-text">Updating your draft preview…</p>}
  </section>;
}
