import {
  useEffect,
  useRef,
  useState,
  useCallback,
  lazy,
  Suspense,
} from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useDropzone } from "react-dropzone";
import { animate, createScope } from "animejs";
import {
  ArrowRight,
  Moon,
  Sun,
  Check,
  ChevronDown,
  Download,
  FilePlus2,
  FileText,
  FolderOpen,
  HelpCircle,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Brand, Evidence, Modal, Status } from "./components";
import { useSession } from "./store";
import {
  getPaperworkAgent,
  isApproved,
  projectSchema,
  restoreFields,
  type SavedProject,
  type SemanticField,
  type SourceSpan,
} from "./domain";
import {
  download,
  disposeDownloadUrls,
  parseDocument,
  sampleDocuments,
} from "./pdf";
import { sampleAdapter } from "./sample";
import VerificationPage, { type VerificationTab } from "./VerificationPage";
import UploadPage from "./UploadPage";
import AnswerEditor from "./AnswerEditor";
import ConversationPage from "./ConversationPage";
import DraftPreview from "./DraftPreview";
import ExportPage from "./ExportPage";
import { useJourney, type Stage } from "./journey";
import { confirmationKey, handled, interviewComplete, pendingFields } from "./interview";
const PdfViewer = lazy(() => import("./PdfViewer"));
type Tab = VerificationTab;
export default function SessionLayout() {
  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => { document.documentElement.dataset.workspaceTheme = darkMode ? "dark" : "light"; return () => { delete document.documentElement.dataset.workspaceTheme; }; }, [darkMode]);
  const session = useSession();
  const chatRunning = useJourney((s) => s.running);
  const progress = useJourney((s) => s.progress);
  const finished = interviewComplete(session.fields, progress);
  const confirmed = !!session.confirmation && session.confirmation === confirmationKey(session.documents, session.fields, progress);
  const { documents, fields, selected, activeDoc, page, source, mode } =
    session;
  const route = useLocation();
  const navigate = useNavigate();
  const isSample = mode === "sample";
  const stage: Stage = route.pathname.endsWith("/verification") ? "verification" : route.pathname.endsWith("/export") ? "export" : route.pathname.endsWith("/conversation") || route.pathname.endsWith("/sample") ? "conversation" : "upload";
  const [previewMode, setPreviewMode] = useState<"draft" | "original">("draft");
  const [workingEdit, setWorkingEdit] = useState<{ id: string; value: string }>();
  const [tab, setTab] = useState<Tab>("Review");
  const [narrow, setNarrow] = useState(
    () => matchMedia("(max-width: 850px)").matches,
  );
  const pendingFocus = useRef<"Document" | "Review" | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const draftChanged = useCallback((dirty: boolean, value?: string) => {
    setUnsaved(dirty);
    if (dirty) useSession.getState().invalidateConfirmation();
    const state = useSession.getState();
    const current = state.fields.find((f) => f.id === state.selected);
    setWorkingEdit(dirty && current && value !== undefined ? { id: current.id, value } : undefined);
    if (dirty && current && (isApproved(current) || current.source))
      state.update(current.id, current.value);
  }, []);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<
    | "none"
    | "clear"
    | "add"
    | "export"
    | "confirm"
    | "restore"
    | "switch"
    | "agent"
    | "source"
  >("none");
  const [fieldLabel, setFieldLabel] = useState("");
  const [project, setProject] = useState<SavedProject>();
  const [confirmCopy, setConfirmCopy] = useState(
    "Your current files and answers will be removed from memory. Download a project first if you want to resume later.",
  );
  const [confirmAction, setConfirmAction] = useState<() => void>(
    () => () => {},
  );
  const [questionView, setQuestionView] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [sourceDoc, setSourceDoc] = useState("");
  const [sourcePage, setSourcePage] = useState(1);
  const [sourceQuote, setSourceQuote] = useState("");
  const [sourceError, setSourceError] = useState("");
  const sourceJob = useRef(0);
  const controller = useRef<AbortController | undefined>(undefined);
  const job = useRef(0);
  const sampleStarted = useRef(false);
  const alive = useRef(true);
  const main = useRef<HTMLDivElement>(null);
  const target = documents.find((d) => d.role === "target");
  const doc = documents.find((d) => d.id === activeDoc);
  const field = fields.find((f) => f.id === selected);
  const reviewed = fields.filter(isApproved).length;
  const capabilities =
    mode === "sample"
      ? sampleAdapter.capabilities
      : getPaperworkAgent().capabilities;
  useEffect(() => {
    if (stage !== "upload" && !target && !route.pathname.endsWith("/sample") && !busy) {
      navigate("/app", { replace: true });
      setNotice("Open a PDF to begin this session.");
    }
    if (target && !["signed", "xfa", "image"].includes(target.support) && stage === "verification" && !interviewComplete(useSession.getState().fields, useJourney.getState().progress)) {
      navigate("/app/conversation", { replace: true }); setNotice("Finish the interview before checking your answers.");
    }
    document.querySelector<HTMLElement>(".stage-heading h1, .chat-title h1")?.focus({ preventScroll: true });
  }, [route.pathname, target?.id]);
  useEffect(() => {
    if (stage === "export" && target && !confirmed) { navigate("/app/verification", { replace: true }); setNotice("Confirm your current information before exporting."); }
  }, [stage, confirmed, target?.id]);
  useEffect(() => {
    setPreviewMode("draft");
    setWorkingEdit(undefined);
  }, [selected, target?.id]);
  useEffect(() => {
    const query = matchMedia("(max-width: 850px)");
    const update = () => setNarrow(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (pendingFocus.current) {
      const selector =
        pendingFocus.current === "Document"
          ? "#workspace-document"
          : ".review-detail h2";
      document
        .querySelector<HTMLElement>(selector)
        ?.focus({ preventScroll: true });
      pendingFocus.current = null;
    }
  }, [tab, selected, source]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      sampleStarted.current = false;
      controller.current?.abort();
      sourceJob.current++;
      disposeDownloadUrls();
      job.current++;
    };
  }, []);
  useEffect(() => {
    // A different target is a hard boundary for all document-derived local state.
    sourceJob.current++;
    disposeDownloadUrls();
    setProject(undefined);
    setConfirmAction(() => () => {});
    setSourceDoc("");
    setSourceQuote("");
    setSourceError("");
    setFieldLabel("");
    setShowFiles(false);
    setQueueOpen(false);
    setQuestionView(false);
    setTab("Review");
    setDialog("none");
  }, [target?.id]);
  useEffect(() => {
    if (sourceDoc && !documents.some((d) => d.id === sourceDoc)) {
      sourceJob.current++;
      setSourceDoc("");
      setSourceQuote("");
      setSourceError("");
      if (dialog === "source") setDialog("none");
    }
  }, [documents, sourceDoc, dialog]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (useSession.getState().dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    if (route.pathname.endsWith("/sample") && !sampleStarted.current) {
      sampleStarted.current = true;
      void startSample();
    }
  }, [route.pathname]);
  useEffect(() => {
    if (!main.current) return;
    const scope = createScope({
      root: main,
      mediaQueries: { reduceMotion: "(prefers-reduced-motion: reduce)" },
    }).add((self) => {
      if (self?.matches.reduceMotion) return;
      animate(".review-detail", {
        opacity: [0.7, 1],
        translateY: [5, 0],
        duration: 200,
        ease: "outExpo",
      });
      if (field && isApproved(field))
        animate(".reviewed-check", {
          scale: [0.8, 1],
          duration: 250,
          ease: "outExpo",
        });
    });
    return () => scope.revert();
  }, [selected, field?.state]);
  async function startSample() {
    controller.current?.abort();
    session.clear();
    const ticket = ++job.current;
    setBusy("Preparing the sample");
    setError("");
    try {
      const data = await sampleDocuments();
      if (ticket !== job.current || !alive.current) return;
      useSession.getState().setSession("sample", data.documents, data.fields);
      const c = new AbortController();
      controller.current = c;
      const result = await sampleAdapter.analyze(
        { target: data.documents[0], supporting: data.documents.slice(1) },
        c.signal,
      );
      if (ticket !== job.current || !alive.current) return;
      useSession
        .getState()
        .applyAnalysis(result.fields, result.analysisRevision);
      setNotice(
        "Fictional sample ready. Start with the suggested name or the address question.",
      );
      navigate("/app/conversation", { replace: true });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError(message(e));
    } finally {
      if (ticket === job.current && alive.current) setBusy("");
    }
  }
  function cancel() {
    job.current++;
    controller.current?.abort();
    setBusy("");
    setNotice("Operation cancelled. Your current answers are unchanged.");
  }
  async function upload(files: File[], role: "target" | "support") {
    if (!files.length) return;
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    const ticket = ++job.current;
    const epoch = useSession.getState().epoch;
    setBusy("Opening your PDF");
    setError("");
    try {
      if (role === "support" && documents.length + files.length > 20)
        throw new Error(
          "This session holds up to 20 documents. Remove a record before adding another.",
        );
      const parsed = await Promise.all(
        files.map((f) => parseDocument(f, role, undefined, c.signal)),
      );
      if (
        ticket !== job.current ||
        epoch !== useSession.getState().epoch ||
        !alive.current
      )
        return;
      if (role === "target") {
        session.setSession("manual", [parsed[0].doc], parsed[0].fields);
        navigate("/app/conversation");
        setTab("Review");
      } else parsed.forEach((p) => session.addDocument(p.doc));
      setNotice(
        role === "target"
          ? "Document opened. Let's work through your answers."
          : "Supporting records added.",
      );
    } catch (e) {
      if (alive.current && ticket === job.current && !c.signal.aborted)
        setError(message(e));
    } finally {
      if (ticket === job.current && alive.current) setBusy("");
    }
  }
  const dropzone = useDropzone({
    onDropAccepted: (files) => target ? requestClear(() => void upload(files.slice(0, 1), "target"), "Opening another form replaces the current documents, conversation and answers.") : void upload(files.slice(0, 1), "target"),
    onDropRejected: () => setError("Choose one PDF, up to 20 MB."),
    accept: { "application/pdf": [".pdf"] },
    maxSize: 20 * 1024 * 1024,
    multiple: false,
    disabled: !!busy,
  });
  function requestClear(
    action: () => void = () => {
      session.clear();
      useJourney.getState().reset();
      sampleStarted.current = false;
      navigate("/app");
      setDialog("none");
    },
    description = "Your current files and answers will be removed from memory. Download a project first if you want to resume later.",
  ) {
    if (session.dirty || documents.length) {
      setConfirmCopy(description);
      setConfirmAction(() => action);
      setDialog("clear");
    } else action();
  }
  function selectField(id: string) {
    if (unsaved)
      setNotice("The unsaved edit was discarded when you changed fields.");
    pendingFocus.current = "Review";
    session.select(id);
    setQuestionView(false);
    setTab("Review");
    setQueueOpen(false);
  }
  function reveal(s: SourceSpan) {
    pendingFocus.current = "Document";
    session.showSource(s);
    setTab("Document");
    setPreviewMode("original");
  }
  async function analyze() {
    const adapter = mode === "sample" ? sampleAdapter : getPaperworkAgent();
    if (!adapter.capabilities.analysis) {
      setDialog("agent");
      return;
    }
    if (!target) return;
    const ticket = ++job.current;
    const epoch = session.epoch;
    const c = new AbortController();
    controller.current = c;
    setBusy("Reading the form");
    setError("");
    try {
      const result = await adapter.analyze(
        { target, supporting: documents.filter((d) => d.role === "support") },
        c.signal,
      );
      if (
        ticket !== job.current ||
        epoch !== useSession.getState().epoch ||
        result.documentHash !== target.hash ||
        !alive.current
      )
        return;
      if (!result.analysisRevision.trim())
        throw new Error("The agent returned no analysis revision. Try again.");
      session.applyAnalysis(result.fields, result.analysisRevision);
      setNotice("Suggestions are ready for your review.");
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError(message(e));
    } finally {
      if (ticket === job.current && alive.current) setBusy("");
    }
  }
  function startExport() {
    if (unsaved) { setNotice("Save your changes before continuing."); return; }
    if (!interviewComplete(useSession.getState().fields, useJourney.getState().progress)) {
      const pending = pendingFields(useSession.getState().fields, useJourney.getState().progress);
      setNotice(`Finish ${pending.length} remaining question${pending.length === 1 ? "" : "s"} before confirming your information.`);
      navigate("/app/conversation"); return;
    }
    setDialog("confirm");
  }
  function saveProject() {
    if (!target) return;
    if (unsaved || useJourney.getState().running) { setNotice("Save your changes and finish the current reply before downloading a project."); return; }
      const data = {
      schemaVersion: 3,
      progress: useJourney.getState().progress,
      stage,
      messages: useJourney.getState().messages,
      skipped: useJourney.getState().skipped,
      question: useJourney.getState().question,
      mode,
      documents: documents.map(({ id, name, hash, role }) => ({
        id,
        name,
        hash,
        role,
      })),
      fields,
    };
    download(
      JSON.stringify(data, null, 2),
      "PapelLess-project.json",
      "application/json",
    );
    setNotice("Project downloaded with your answers and conversation, but no PDFs. Keep the originals to resume later.");
  }
  async function loadProject(file: File) {
    const ticket = ++job.current;
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error("Project file exceeds 2 MB.");
      const p = projectSchema.parse(JSON.parse(await file.text()));
      if (ticket !== job.current || !alive.current) return;
      setProject(p);
      setDialog("restore");
      setError("");
    } catch {
      if (ticket !== job.current || !alive.current) return;
      setError(
        "This project file is invalid or uses an unsupported version. Choose a PapelLess project JSON.",
      );
    }
  }
  async function reattach(files: File[]) {
    if (!project) return;
    setBusy("Checking document identities");
    setError("");
    const ticket = ++job.current;
    const epoch = useSession.getState().epoch;
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    try {
      if (files.length > 20) throw new Error("Choose up to 20 documents.");
      const assigned = new Set<string>();
      const parsed = [];
      for (const file of files) {
        const preliminary = await parseDocument(
          file,
          "support",
          undefined,
          c.signal,
        );
        const old =
          project.documents.find(
            (d) => d.hash === preliminary.doc.hash && !assigned.has(d.id),
          ) ??
          project.documents.find(
            (d) => d.name === file.name && !assigned.has(d.id),
          );
        if (old) assigned.add(old.id);
        const final =
          old?.role === "target"
            ? await parseDocument(file, "target", old.id, c.signal)
            : {
                doc: { ...preliminary.doc, id: old?.id ?? preliminary.doc.id },
                fields: [],
              };
        parsed.push(final);
      }
      const originalTarget = project.documents.find(
        (d) => d.role === "target",
      )!;
      const newTarget = parsed.find((p) => p.doc.id === originalTarget.id);
      if (!newTarget)
        throw new Error(
          `Reattach the target PDF named ${originalTarget.name}.`,
        );
      const docs = parsed.map((p) => p.doc);
      const restored = restoreFields(project, docs, newTarget.fields).map((f) => ({ ...f, approval: undefined, state: f.state === "confirmed" ? "user_provided" as const : f.state }));
      if (
        ticket !== job.current ||
        epoch !== useSession.getState().epoch ||
        !alive.current
      )
        return;
      session.setSession(project.mode, docs, restored);
      session.applyAnalysis(restored);
      sampleStarted.current = true;
      const savedMessages = project.messages ?? [];
      const savedSkipped = project.skipped ?? [];
      const identitiesMatch = docs.length === project.documents.length && docs.every((d) => project.documents.some((old) => old.id === d.id && old.hash === d.hash));
      const safeMessages = savedMessages.map((m) => {
        const changed = m.sources?.some((s) => !docs.some((d) => d.id === s.documentId && project.documents.some((old) => old.id === d.id && old.hash === d.hash)));
        return changed ? { ...m, text: `${m.text}\nSource documents changed or are unavailable. Check this reply again.`, sources: m.sources?.filter((s) => docs.some((d) => d.id === s.documentId && project.documents.some((old) => old.id === d.id && old.hash === d.hash))) } : m;
      });
      const restoredProgress = identitiesMatch && project.schemaVersion === 3 ? Object.fromEntries(Object.entries(project.progress ?? {}).filter(([id, entry]) => restored.some((f) => f.id === id && f.revision === entry.revision && handled(f, { [id]: entry })))) : {};
      useJourney.getState().restore(safeMessages, identitiesMatch ? savedSkipped : [], undefined, restoredProgress);
      navigate(project.stage !== "conversation" && interviewComplete(restored, restoredProgress) ? "/app/verification" : "/app/conversation");
      setDialog("none");
      setNotice(
        docs.every((d) =>
          project.documents.some(
            (old) => old.id === d.id && old.hash === d.hash,
          ),
        ) && docs.length === project.documents.length
          ? "Project restored. Document identities match."
          : "Project restored with changes. Affected answers need review; unmatched source links were removed.",
      );
    } catch (e) {
      if (ticket === job.current && alive.current && !c.signal.aborted)
        setError(message(e));
    } finally {
      if (ticket === job.current) setBusy("");
    }
  }
  async function linkSource() {
    if (!field) return;
    const ticket = ++sourceJob.current;
    const chosen = documents.find((d) => d.id === sourceDoc);
    if (!chosen) {
      setSourceError("Choose a record first.");
      return;
    }
    setSourceError("");
    const epoch = session.epoch;
    try {
      const { pdfjs } = await import("react-pdf");
      const task = pdfjs.getDocument({ data: chosen.bytes.slice() });
      try {
        const pdf = await task.promise;
        const p = await pdf.getPage(sourcePage);
        const text = await p.getTextContent();
        const normalize = (s: string) =>
          s.normalize("NFKC").replace(/\s+/g, " ").trim();
        const passage = normalize(
          text.items.map((item) => ("str" in item ? item.str : "")).join(" "),
        );
        if (!passage.includes(normalize(sourceQuote)))
          throw new Error(
            "That quotation could not be found on this page. Copy the exact text from the PDF.",
          );
        if (
          epoch !== useSession.getState().epoch ||
          !alive.current ||
          ticket !== sourceJob.current
        )
          return;
        session.update(field.id, field.value, {
          documentId: chosen.id,
          page: sourcePage,
          quote: sourceQuote.trim(),
        });
        setDialog("none");
        setNotice("Record linked. Review the answer in context.");
      } finally {
        await task.destroy();
      }
    } catch (e) {
      if (ticket === sourceJob.current && alive.current)
        setSourceError(message(e));
    }
  }
  const unsafe = target && ["signed", "xfa", "image"].includes(target.support);
  const documentPane = (
    <section
      id="workspace-document"
      role={narrow && stage === "verification" ? "tabpanel" : "region"}
      aria-labelledby={narrow && stage === "verification" ? "workspace-tab-document" : undefined}
      tabIndex={-1}
      className={`document-pane ${stage !== "verification" ? "always-visible" : `mobile-${tab === "Document" ? "visible" : "hidden"}`}`}
      aria-label="Document viewer"
    >
      <div className="pane-heading">
        <div>
          <FileText size={17} />
          <label htmlFor="active-document" className="sr-only">
            Active document
          </label>
          <select
            id="active-document"
            value={activeDoc ?? ""}
            onChange={(e) => session.showDoc(e.target.value)}
          >
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <button
          className="icon-button"
          aria-label="Manage documents"
          onClick={() => setShowFiles(!showFiles)}
        >
          <FolderOpen size={18} />
        </button>
      </div>
      {showFiles && (
        <div className="document-list">
          {documents.map((d) => (
            <div key={d.id}>
              <span>
                {d.name}
                <small>
                  {d.role === "target" ? "Form" : "Supporting record"}
                </small>
              </span>
              <button
                className="icon-button"
                aria-label={`Remove ${d.name}`}
                onClick={() =>
                  requestClear(
                    () => {
                      session.remove(d.id);
                      setDialog("none");
                    },
                    d.role === "target"
                      ? "Removing the form clears this workspace and its answers."
                      : "Removing this supporting record invalidates the review of answers that cite it. Other documents remain in this session.",
                  )
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {!isSample && (
            <label className="button secondary upload-label">
              <Plus size={15} /> Add supporting PDFs
              <input
                type="file"
                accept="application/pdf"
                multiple
                disabled={!!busy}
                onChange={(e) => {
                  void upload(Array.from(e.target.files ?? []), "support");
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      )}
      {doc && (
        <Suspense
          fallback={<p className="loading-text">Opening document viewer…</p>}
        >
          <PdfViewer
            key={doc.id}
            bytes={doc.bytes}
            page={page}
            onPage={session.setPage}
            source={source}
            expectedPages={doc.pages}
          />
        </Suspense>
      )}
    </section>
  );
  const reviewPane = (
    <section
      id="workspace-review"
      role={narrow ? "tabpanel" : "region"}
      aria-labelledby={
        narrow ? `workspace-tab-${tab.toLowerCase()}` : undefined
      }
      ref={main}
      className={`review-pane mobile-${tab !== "Document" ? "visible" : "hidden"}`}
      aria-label="Answer review"
    >
      <div className="review-pane-header">
        <div className="review-nav">
          <button
            className={!questionView ? "active" : ""}
            onClick={() => {
              setQuestionView(false);
              setTab("Review");
              setQueueOpen(false);
            }}
          >
            Review answers
          </button>
          <button
            className={questionView ? "active" : ""}
            onClick={() => {
              navigate("/app/conversation");
            }}
          >
            Ask a question{" "}
            <span>{fields.filter((f) => !f.value && f.question).length}</span>
          </button>
        </div>
        <div className="review-progress">
          <span>
            {reviewed} of {fields.length} reviewed
          </span>
          <div className="progress-track">
            <div
              style={{
                width: `${fields.length ? (reviewed / fields.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </div>
      {unsafe ? (
        <div className="unsupported-state">
          <ShieldCheck size={32} />
          <h2>
            {target?.support === "signed"
              ? "This form includes a signature."
              : target?.support === "xfa"
                ? "This form uses XFA."
                : "This PDF has no readable text."}
          </h2>
          <p>
            {target?.support === "signed"
              ? "PapelLess will not rewrite a document containing a signature field. Open an unsigned copy to continue."
              : target?.support === "xfa"
                ? "XFA fields cannot be safely edited here. Choose a standard fillable PDF instead."
                : "This appears to be an image-only PDF. Text recognition is not connected. Choose a digital PDF to continue."}
          </p>
          <button className="button secondary" onClick={() => requestClear()}>
            Choose another form
          </button>
        </div>
      ) : (
        <>
          <div className="field-picker">
            <button
              className="field-picker-button"
              aria-label="Choose a field"
              aria-expanded={queueOpen}
              onClick={() => setQueueOpen(!queueOpen)}
            >
              <span>{field?.label ?? "Your answers"}</span>
              <span>
                {fields.length} fields <ChevronDown size={16} />
              </span>
            </button>
            <div
              className={`field-queue ${queueOpen || !fields.length ? "" : "queue-collapsed"}`}
            >
              {(
                ["Needs attention", "Ready to review", "Reviewed"] as const
              ).map((group) => {
                const groupFields = fields.filter((f) =>
                  questionView
                    ? !!f.question && !f.value
                    : group === "Reviewed"
                      ? isApproved(f)
                      : group === "Ready to review"
                        ? !!f.value && !isApproved(f) && f.state !== "conflict"
                        : !f.value || f.state === "conflict",
                );
                if (
                  !groupFields.length ||
                  (questionView && group !== "Needs attention")
                )
                  return null;
                return (
                  <div key={group}>
                    <h3>{questionView ? "Your questions" : group}</h3>
                    {groupFields.map((f) => (
                      <button
                        key={f.id}
                        className={`queue-field ${f.id === selected ? "selected" : ""}`}
                        onClick={() => selectField(f.id)}
                      >
                        <span>
                          {isApproved(f) ? (
                            <Check size={15} />
                          ) : f.state === "conflict" ? (
                            <HelpCircle size={15} />
                          ) : (
                            <FileText size={15} />
                          )}
                          <span>
                            {f.label}
                            <small>
                              {isApproved(f)
                                ? "Reviewed by you"
                                : f.state === "conflict"
                                  ? "Choose the right context"
                                  : f.value
                                    ? f.value
                                    : "Needs your answer"}
                            </small>
                          </span>
                        </span>
                        <ArrowRight size={15} />
                      </button>
                    ))}
                  </div>
                );
              })}
              {!fields.length && (
                <div className="plain-intro">
                  <h2>Make room for your answers.</h2>
                  <p>
                    This PDF has no editable fields. Add an answer and prepare a
                    separate answer sheet.
                  </p>
                </div>
              )}
              <button
                className="text-button add-answer"
                onClick={() => {
                  setFieldLabel("");
                  setDialog("add");
                }}
              >
                <Plus size={16} /> Add an answer
              </button>
            </div>
          </div>
          {field && (
            <div className="review-detail" key={field.id}>
              <div className="detail-heading">
                <h2 tabIndex={-1}>{field.label}</h2>
                <Status reviewed={isApproved(field)}>
                  {isApproved(field)
                    ? "Reviewed by you"
                    : field.state === "conflict"
                      ? "Needs clarification"
                      : field.state === "candidate"
                        ? "Suggested answer"
                        : "Your answer"}
                </Status>
              </div>
              {field.question &&
                (!field.value || field.state === "conflict") && (
                  <p className="question-prompt">{field.question}</p>
                )}
              {field.conflict && field.state === "conflict" && (
                <div className="conflict">
                  <p>{field.conflict.explanation}</p>
                  {field.conflict.alternatives
                    .filter(
                      (a) =>
                        !a.source ||
                        documents.some((d) => d.id === a.source!.documentId),
                    )
                    .map((answer, i) => (
                      <div className="alternative" key={i}>
                        <strong>{answer.value}</strong>
                        {answer.source && (
                          <Evidence
                            quote={answer.source.quote}
                            name={
                              documents.find(
                                (d) => d.id === answer.source!.documentId,
                              )?.name
                            }
                            page={answer.source.page}
                            onReveal={() => reveal(answer.source!)}
                          />
                        )}
                        <button
                          className="button secondary"
                          onClick={() =>
                            session.update(
                              field.id,
                              answer.value,
                              answer.source,
                            )
                          }
                        >
                          Use this address <ArrowRight size={16} />
                        </button>
                      </div>
                    ))}
                </div>
              )}
              <AnswerEditor
                key={field.id}
                field={field}
                onDraftChange={draftChanged}
                onRequired={(required) =>
                  session.markRequired(field.id, required)
                }
                onSave={(value) => {
                  session.update(field.id, value);
                  setNotice("Answer saved. Review it before exporting.");
                }}
              />
              {field.source &&
                documents.some((d) => d.id === field.source!.documentId) && (
                  <Evidence
                    quote={field.source.quote}
                    name={
                      documents.find((d) => d.id === field.source!.documentId)
                        ?.name
                    }
                    page={field.source.page}
                    onReveal={() => reveal(field.source!)}
                  />
                )}
              {documents.some((d) => d.role === "support") && (
                <button
                  className="text-button link-record"
                  onClick={() => {
                    setSourceDoc(
                      documents.find((d) => d.role === "support")!.id,
                    );
                    setSourcePage(1);
                    setSourceQuote("");
                    setSourceError("");
                    setDialog("source");
                  }}
                >
                  Link a supporting passage <Plus size={14} />
                </button>
              )}
              {!field.value && !field.required && <button className="button secondary" onClick={() => { useJourney.getState().record(field.id, field.revision, "explicit_blank"); session.invalidateConfirmation(); }}>Confirm leaving this blank</button>}
              <p className="answer-review-note">You will confirm all the information together when you continue.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
  return (
    <div
      className={`workspace ${darkMode ? "workspace-dark" : "workspace-light"} ${stage === "conversation" && !unsafe ? "workspace-chat" : ""}`}
      onClickCapture={(event) => {
        const button = (event.target as HTMLElement).closest("button");
        if (button && !button.disabled) button.focus({ preventScroll: true });
      }}
    >
      <a href="#workspace-main" className="skip-link">
        Skip to workspace
      </a>
      <header className="workspace-header">
        <Brand dark={darkMode} />
        <div className="workspace-title">
          <span>{isSample ? "Sample workspace" : "Your workspace"}</span>
          {isSample && <span className="sample-label">Fictional records</span>}
        </div>
        <div className="workspace-actions">
          <button className="icon-button theme-toggle" aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} title={darkMode ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setDarkMode((value) => !value)}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button
            className="icon-button"
            aria-label="Clear workspace"
            onClick={() => requestClear()}
            disabled={!!busy}
          >
            <Trash2 size={18} />
          </button>
          {target && (
            <button
              className="button secondary project-save"
              aria-label="Save project"
              onClick={saveProject}
            >
              <Download size={15} /> Save project
            </button>
          )}
          {stage !== "conversation" && target && stage !== "upload" && <button className="button primary export-action" disabled={!!unsafe || !!busy || chatRunning} onClick={() => stage === "export" ? navigate("/app/verification") : startExport()}>
            {stage === "export" ? "Back to verification" : "Continue"} <ArrowRight size={16} />
          </button>}
        </div>
      </header>
      <nav className="journey-nav" aria-label="Form progress">
        {(["upload", "conversation", "verification", "export"] as Stage[]).map((s) => <Link key={s} to={s === "upload" ? "/app" : `/app/${s}`} aria-current={stage === s ? "step" : undefined} onClick={(e) => {
          if (chatRunning || unsaved) { e.preventDefault(); setNotice(chatRunning ? "Stop the response before changing stages." : "Save your answer before changing stages."); return; }
          if ((s !== "upload" && !target) || (s === "verification" && !finished && !unsafe) || (s === "export" && !confirmed)) { e.preventDefault(); setNotice(s === "export" ? "Confirm your information in Verification first." : target ? "Finish every required answer and explicitly handle optional questions first." : "Open a PDF first."); }
        }}>{s === "upload" ? "Upload" : s === "conversation" ? "Conversation" : s === "verification" ? "Verification" : "Export"}</Link>)}
      </nav>
      <div className="session-strip">
        <span>
          <ShieldCheck size={14} /> Files stay in this session
        </span>
        <span>
          {isSample
            ? "Sample analysis · not a live model"
            : capabilities.analysis
              ? "Local agent available"
              : "Manual mode · AI agent not connected"}
          {target && (
            <button
              className="text-button"
              onClick={() => void analyze()}
              disabled={!!busy}
            >
              {isSample
                ? "Run sample again"
                : capabilities.analysis
                  ? "Suggest answers"
                  : "Agent details"}{" "}
              <ChevronDown size={13} />
            </button>
          )}
        </span>
      </div>
      <div className="feedback-area">
        {busy && (
          <div className="busy-banner" role="status">
            <span>{busy}…</span>
            <button onClick={cancel}>Cancel</button>
          </div>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
      <main id="workspace-main">
        {target && stage === "verification" && <div className="stage-heading verification-heading"><h1 tabIndex={-1}>Check your answers.</h1><p>Edit the details, inspect the preview, then continue to confirm your information.</p></div>}
        {!target || stage === "upload" ? (
          <UploadPage dropzone={dropzone} busy={busy} onSample={() => {
            sampleStarted.current = false;
            requestClear(() => { session.clear(); navigate("/app/sample"); }, "Opening the sample replaces this session with fictional records.");
          }} onProject={(file) => void loadProject(file)} />
        ) : stage === "conversation" && !unsafe ? (
          <ConversationPage ready={!busy} documentPane={documentPane} onReview={() => navigate("/app/verification")} onSource={(s) => session.showSource(s)} onAdd={() => { setFieldLabel(""); setDialog("add"); }} />
        ) : stage === "export" ? (
          <ExportPage current={confirmed} target={target} fields={fields} documents={documents} revisionKey={session.confirmation ?? ""} onBack={() => navigate("/app/verification")} onProject={saveProject} />
        ) : (
          <VerificationPage tab={tab} onTab={(next) => { setTab(next); setQuestionView(false); setQueueOpen(false); }} reviewPane={reviewPane} documentPane={
                  <div id={previewMode === "draft" && !unsafe ? "workspace-document" : undefined} role={narrow && previewMode === "draft" && !unsafe ? "tabpanel" : undefined} aria-labelledby={narrow && previewMode === "draft" && !unsafe ? "workspace-tab-document" : undefined} tabIndex={-1} className={`verification-document mobile-${tab === "Document" ? "visible" : "hidden"}`}>
                    {!unsafe && <div className="preview-switch"><button className={previewMode === "draft" ? "active" : ""} onClick={() => setPreviewMode("draft")}>Edited draft</button><button className={previewMode === "original" ? "active" : ""} onClick={() => setPreviewMode("original")}>Original & evidence</button></div>}
                    {previewMode === "original" || unsafe ? documentPane : <DraftPreview target={target} fields={fields.map((f) => workingEdit?.id === f.id ? { ...f, value: workingEdit.value, state: "user_provided", approval: undefined } : f)} />}
                  </div>
          } />
        )}
      </main>
      <div className="workspace-bottom">
        <span>No signatures. No submissions. Just your draft.</span>
        <button
          className="text-button"
          onClick={() =>
            requestClear(() => {
              session.clear();
              sampleStarted.current = false;
              navigate(isSample ? "/app" : "/app/sample");
              setDialog("none");
            })
          }
        >
          {isSample ? "Use your own form" : "Try the sample"}{" "}
          <ArrowRight size={14} />
        </button>
      </div>
      <Modal
        open={dialog === "clear"}
        onOpenChange={(open) => {
          if (!open) setDialog("none");
        }}
        title="Confirm this change"
        description={confirmCopy}
      >
        <div className="modal-actions">
          {target && (
            <button className="button secondary" onClick={saveProject}>
              Save project
            </button>
          )}
          <button
            className="button primary"
            onClick={() => {
              job.current++;
              controller.current?.abort();
              confirmAction();
            }}
          >
            Clear and continue
          </button>
        </div>
      </Modal>
      <Modal
        open={dialog === "add"}
        onOpenChange={(open) => {
          if (!open) setDialog("none");
        }}
        title="Add an answer"
        description="Name the field as it appears on your form. It will be included in the answer sheet."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (fieldLabel.trim()) {
              session.addField(fieldLabel.trim());
              setDialog("none");
            }
          }}
        >
          <label htmlFor="field-label">Field name</label>
          <input
            id="field-label"
            maxLength={500}
            value={fieldLabel}
            onChange={(e) => setFieldLabel(e.target.value)}
            autoFocus
            required
          />
          <div className="modal-actions">
            <button className="button primary" disabled={!fieldLabel.trim()}>
              Add answer <Plus size={16} />
            </button>
          </div>
        </form>
      </Modal>
      <Modal open={dialog === "confirm"} onOpenChange={(open) => { if (!open) setDialog("none"); }} title="Is all the information correct?" description="Check your answers and the draft preview. Continuing records that you reviewed this information; it does not sign or submit the document.">
        <div className="modal-actions"><button className="button secondary" onClick={() => setDialog("none")}>No, keep editing</button><button className="button primary" disabled={unsaved || !finished} onClick={() => { if (session.confirmAll()) { setDialog("none"); setNotice(""); navigate("/app/export"); } }}>Yes, continue to export <ArrowRight size={16} /></button></div>
      </Modal>
      <Modal
        open={dialog === "restore"}
        onOpenChange={(open) => {
          if (!open) {
            job.current++;
            controller.current?.abort();
            setProject(undefined);
            setBusy("");
            setDialog("none");
          }
        }}
        title="Bring back your original PDFs."
        description="The project stores answers and file identities, not the documents themselves. Choose the original files together to restore their source links."
      >
        <ul className="restore-list">
          {project?.documents.map((d) => (
            <li key={d.id}>{d.name}</li>
          ))}
        </ul>
        <label className="button primary upload-label">
          <Upload size={16} /> Reattach PDFs
          <input
            type="file"
            accept="application/pdf"
            multiple
            disabled={!!busy}
            onChange={(e) => void reattach(Array.from(e.target.files ?? []))}
          />
        </label>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
      </Modal>
      <Modal
        open={dialog === "agent"}
        onOpenChange={(open) => {
          if (!open) setDialog("none");
        }}
        title="The AI agent is not connected."
        description="You can fill supported PDF fields, review your answers, and export a draft manually."
      >
        <p>
          Evidence-linked suggestions and focused questions are demonstrated
          with fictional records in the sample workspace.
        </p>
        <button
          className="button primary"
          onClick={() => {
            setDialog("none");
            requestClear(() => {
              session.clear();
              navigate("/app/sample");
            });
          }}
        >
          Explore the sample <ArrowRight size={16} />
        </button>
      </Modal>
      <Modal
        open={dialog === "source"}
        onOpenChange={(open) => {
          if (!open) {
            sourceJob.current++;
            setDialog("none");
          }
        }}
        title="Link a supporting passage"
        description="Copy an exact quotation from a record. PapelLess checks that the text exists on that page; you decide whether it supports this answer."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void linkSource();
          }}
        >
          <label htmlFor="source-document">Supporting record</label>
          <select
            id="source-document"
            value={sourceDoc}
            onChange={(e) => {
              setSourceDoc(e.target.value);
              setSourcePage(1);
            }}
          >
            {documents
              .filter((d) => d.role === "support")
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
          <label htmlFor="source-page">Page</label>
          <input
            id="source-page"
            type="number"
            min={1}
            max={documents.find((d) => d.id === sourceDoc)?.pages ?? 1}
            value={sourcePage}
            onChange={(e) => setSourcePage(Number(e.target.value))}
            required
          />
          <label htmlFor="source-quote">Exact quotation</label>
          <textarea
            id="source-quote"
            value={sourceQuote}
            maxLength={10000}
            onChange={(e) => setSourceQuote(e.target.value)}
            required
          />
          {sourceError && (
            <p className="error-box" role="alert">
              {sourceError}
            </p>
          )}
          <div className="modal-actions">
            <button className="button primary" disabled={!sourceQuote.trim()}>
              Link passage <Check size={16} />
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something interrupted this operation. Please try again.";
}
