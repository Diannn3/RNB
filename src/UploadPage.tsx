import { ArrowRight, FilePlus2, FolderOpen, Upload } from "lucide-react";
import type { useDropzone } from "react-dropzone";
export default function UploadPage({ dropzone, busy, onSample, onProject }: {
  dropzone: ReturnType<typeof useDropzone>; busy: string; onSample: () => void; onProject: (file: File) => void;
}) {
  return (
          <section className="empty-workspace">
            <div className="empty-copy">
              <h1>
                A fresh page.
                <br />A clearer next step.
              </h1>
              <p>
                Open your form. Work through the questions.
                <br />
                Review it all before preparing your draft.
              </p>
            </div>
            <div className="upload-zone" {...dropzone.getRootProps()}>
              <input
                {...dropzone.getInputProps()}
                aria-label="Upload a form PDF"
              />
              <FilePlus2 size={35} />
              <h2>Bring your form.</h2>
              <p>Drop a PDF here, or choose a file.</p>
              <button
                className="button primary"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dropzone.open();
                }}
                disabled={!!busy}
              >
                Choose a PDF <Upload size={17} />
              </button>
              <small>Digital PDFs · up to 20 MB · up to 100 pages</small>
            </div>
            <div className="empty-options">
              <button
                className="text-button"
                onClick={() => onSample()}
              >
                Try the fictional sample <ArrowRight size={16} />
              </button>
              <label className="text-button upload-label">
                <FolderOpen size={16} /> Resume a saved project
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    if (e.target.files?.[0])
                      onProject(e.target.files[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </section>
  );
}
