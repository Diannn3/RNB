import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { Check, Download } from "lucide-react";
import { Evidence, Modal } from "./components";
const PdfViewer = lazy(() => import("./PdfViewer"));
export default function SampleDraft() {
  const [open, setOpen] = useState(false);
  const [bytes, setBytes] = useState<Uint8Array>();
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ticket = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      ticket.current++;
    };
  }, []);
  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      ticket.current++;
      setBytes(undefined);
      setBusy(false);
      setError("");
      setPage(1);
    }
  };
  async function approve() {
    const job = ++ticket.current;
    setBusy(true);
    setError("");
    try {
      const { sampleDocuments, exportDraft } = await import("./pdf");
      const { approveField, changeField } = await import("./domain");
      const data = await sampleDocuments();
      const fields = data.fields.map((field) =>
        field.id === "full_name"
          ? approveField(
              changeField(field, "Alex Reyes", {
                documentId: "sample-record",
                page: 1,
                quote: "Full name: Alex Reyes",
              }),
            )
          : field,
      );
      const generated = await exportDraft(data.documents[0], fields);
      if (!alive.current || job !== ticket.current) return;
      setBytes(generated);
      setPage(1);
    } catch (e) {
      if (alive.current && job === ticket.current)
        setError(
          e instanceof Error
            ? e.message
            : "This draft could not be prepared. Try again.",
        );
    } finally {
      if (alive.current && job === ticket.current) setBusy(false);
    }
  }
  return (
    <>
      <button
        className="button primary"
        onClick={(e) => {
          e.currentTarget.focus();
          setOpen(true);
        }}
      >
        Review a sample draft <Download size={17} />
      </button>
      <Modal
        open={open}
        onOpenChange={close}
        title={bytes ? "Read your sample draft." : "Review the fictional name."}
        description={
          bytes
            ? "Preview the exact bytes you can download. This example has not been signed or submitted."
            : "Confirm the name before preparing an incomplete sample draft. Only this reviewed name will be included; the other entries stay blank."
        }
      >
        {bytes ? (
          <>
            <div className="export-preview">
              <Suspense fallback={<p role="status">Opening draft…</p>}>
                <PdfViewer bytes={bytes} page={page} onPage={setPage} />
              </Suspense>
            </div>
            <div className="modal-actions">
              <button className="button secondary" onClick={() => close(false)}>
                Close preview
              </button>
              <button
                className="button primary"
                onClick={async () => {
                  const { download } = await import("./pdf");
                  download(
                    bytes,
                    "PapelLess-sample-draft.pdf",
                    "application/pdf",
                  );
                }}
              >
                Download sample draft <Download size={16} />
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              Full name: <strong>Alex Reyes</strong>
            </p>
            <Evidence quote="Full name: Alex Reyes" />
            <p className="story-caption">
              Fictional record. Your approval applies only to this
              demonstration.
            </p>
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void approve()}
              >
                {busy
                  ? "Preparing draft…"
                  : "Approve name and prepare incomplete draft"}
                <Check size={16} />
              </button>
            </div>
            {busy && (
              <p role="status">
                Preparing the sample draft. Closing cancels this operation.
              </p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
