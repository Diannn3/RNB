import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Moon, Sun, Plus, Download, ArrowUp, SlidersHorizontal, LoaderCircle } from "lucide-react";
import { Brand, Modal } from "./components";
import { api, apiBlob, resource, ApiError } from "./api";
import type { Workspace, ApiDocument, Structure, Slot, Fact, Draft, Message, Comparison, Explanation, Health, RequestStatus } from "./api";
import "./api-workspace.css";
const PdfViewer = lazy(() => import("./PdfViewer"));
type LoadedDocument = { document: ApiDocument; name: string; structure: Structure; bytes: Uint8Array };
type Answer = { label: string; value: string };
type Transcript = { role: "You" | "PapelLess"; text: string; explanation?: Explanation; comparison?: Comparison };
const post = (body?: object): RequestInit => ({ method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) });

export default function SessionLayout() {
  const [workspace, setWorkspace] = useState<Workspace>();
  const [resumeId, setResumeId] = useState("");
  const [documents, setDocuments] = useState<ApiDocument[]>([]);
  const [recentDocuments, setRecentDocuments] = useState<ApiDocument[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [loaded, setLoaded] = useState<Record<string, LoadedDocument>>({});
  const [target, setTarget] = useState("");
  const [viewDoc, setViewDoc] = useState("");
  const [page, setPage] = useState(1);
  const [source, setSource] = useState<{ documentId: string; page: number; quote: string; rects: [number, number, number, number][] }>();
  const [answers, setAnswers] = useState<Record<string, Record<string, Answer>>>({});
  const [pending, setPending] = useState<Message>();
  const [needsResume, setNeedsResume] = useState(false);
  const [transcript, setTranscript] = useState<Transcript[]>([]);
  const [answer, setAnswer] = useState("");
  const [draft, setDraft] = useState<Draft>();
  const [preview, setPreview] = useState("");
  const [fullPreview, setFullPreview] = useState<Uint8Array>();
  const [draftPage, setDraftPage] = useState(1);
  const [confirmed, setConfirmed] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [tab, setTab] = useState<"Conversation" | "Review">("Conversation");
  const [mobilePane, setMobilePane] = useState<"Work" | "Document">("Work");
  const [health, setHealth] = useState<Health>();
  const [request, setRequest] = useState<RequestStatus>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dark, setDark] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const previewRef = useRef("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const downloadUrls = useRef<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const current = loaded[viewDoc];
  const targetAnswers = answers[target] ?? {};
  const base = workspace ? `/workspaces/${resource(workspace.id)}` : "";

  useEffect(() => { alive.current = true; return () => { alive.current = false; URL.revokeObjectURL(previewRef.current); downloadUrls.current.forEach(URL.revokeObjectURL); }; }, []);
  useEffect(() => {
    let active = true;
    void api<ApiDocument[]>("/documents").then(result => { if (active) setRecentDocuments(result); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not load uploaded files."); })
      .finally(() => { if (active) setLoadingRecent(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { document.documentElement.dataset.workspaceTheme = dark ? "dark" : "light"; return () => { delete document.documentElement.dataset.workspaceTheme; }; }, [dark]);
  useEffect(() => { heading.current?.focus(); }, [tab]);
  useEffect(() => { conversationEnd.current?.scrollIntoView({ block: "nearest" }); }, [transcript, busy]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (pending || Object.keys(answers).length) event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [pending, answers]);

  async function run(label: string, action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(label); setError(""); setNotice("");
    try {
      await action();
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "The operation failed. Try again.");
        if (e instanceof ApiError && e.requestId) await inspect(e.requestId);
      }
    }
    finally { lock.current = false; if (alive.current) setBusy(""); }
  }
  async function inspect(requestId: string) {
    try { const result = await api<RequestStatus>(`/requests/${resource(requestId)}`); if (alive.current) setRequest(result); }
    catch (e) { if (alive.current) setNotice(`Operation returned request ${requestId}; status unavailable: ${e instanceof Error ? e.message : "network error"}`); }
  }
  function invalidateDraft() {
    setDraft(undefined); setConfirmed(""); setConfirmOpen(false); setPreview("");
    setFullPreview(undefined); setDraftPage(1);
    URL.revokeObjectURL(previewRef.current); previewRef.current = "";
  }
  function reset(next: Workspace, docs: ApiDocument[]) {
    invalidateDraft(); setWorkspace(next); setResumeId(next.id); setDocuments(docs); setLoaded({});
    setTarget(docs[0]?.id ?? ""); setViewDoc(""); setAnswers({}); setPending(undefined); setTranscript([]);
    setAnswer(""); setRequest(undefined); setTab("Conversation");
    setNeedsResume(false);
  }
  async function loadDocument(document: ApiDocument, name?: string): Promise<LoadedDocument> {
    if (loaded[document.id]) return loaded[document.id];
    const [structure, blob] = await Promise.all([
      api<Structure>(`/documents/${resource(document.id)}/structure`),
      apiBlob(`/artifacts/${resource(document.id)}`),
    ]);
    const entry = { document, name: name ?? document.filename ?? `${document.document_kind} · earlier upload`, structure, bytes: new Uint8Array(await blob.arrayBuffer()) };
    if (alive.current) setLoaded(previous => ({ ...previous, [document.id]: entry }));
    return entry;
  }
  async function showDocument(document: ApiDocument, name?: string) {
    await loadDocument(document, name);
    if (alive.current) { setViewDoc(document.id); setPage(1); setSource(undefined); }
  }
  async function createWorkspace() {
    const next = await api<Workspace>("/workspaces", post());
    if (alive.current) { reset(next, []); setNewOpen(false); }
  }
  async function resume() {
    const selected = recentDocuments.find(document => document.id === resumeId);
    if (!selected) return;
    const id = resource(selected.workspace_id);
    const [next, docs] = await Promise.all([api<Workspace>(`/workspaces/${id}`), api<ApiDocument[]>(`/workspaces/${id}/documents`)]);
    if (!alive.current) return;
    reset(next, docs); setTarget(selected.id);
    await showDocument(selected);
    setNotice("Documents restored. Use Resume form to retrieve the pending question. Previous answers and drafts are not restored by this browser.");
  }
  async function upload(file: File) {
    if (file.size > 10 * 1024 * 1024) throw new Error("Choose a PDF no larger than 10 MiB and 10 pages.");
    if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error("Choose a PDF file.");
    const form = new FormData(); form.append("file", file);
    const result = await api<{ document: ApiDocument; artifact_id: string; request_id: string }>(`${base}/documents`, { method: "POST", body: form });
    if (!alive.current) return;
    setDocuments(previous => [...previous.filter(d => d.id !== result.document.id), result.document]);
    setToolsOpen(false);
    if (!target) setTarget(result.document.id);
    invalidateDraft();
    await inspect(result.request_id);
    await showDocument(result.document, file.name);
    if (!target) {
      setTab("Conversation");
      setBusy("Preparing your first question…");
      await turn({}, result.document.id, true);
    }
  }
  function findSlot(entry: LoadedDocument | undefined, id: string): Slot | undefined {
    return entry?.structure.widgets.find(slot => slot.id === id) ?? entry?.structure.pages.flatMap(p => p.boxes).find(slot => slot.id === id);
  }
  function fieldLabel(id: string) {
    const slot = findSlot(loaded[target], id);
    return targetAnswers[id]?.label ?? slot?.field_name ?? slot?.text ?? id;
  }
  async function receiveDraft(result: Draft) {
    if (!alive.current) return;
    invalidateDraft(); setDraft(result); setTab("Review"); setPending(undefined);
    setAnswers(previous => {
      const fields = { ...previous[target] };
      for (const id of result.missing_fields) fields[id] = { label: fields[id]?.label ?? fieldLabel(id), value: "" };
      return { ...previous, [target]: fields };
    });
    await loadPreview(result);
  }
  async function loadPreview(result: Draft) {
    const blob = await apiBlob(result.preview_url);
    if (alive.current) { URL.revokeObjectURL(previewRef.current); previewRef.current = URL.createObjectURL(blob); setPreview(previewRef.current); }
  }
  async function turn(body: { answer?: string; skip?: boolean; finalize?: boolean } = {}, documentId = target, automatic = false) {
    invalidateDraft();
    setNeedsResume(true);
    // A turn can save an answer before inference fails on the next question.
    // Keep the user's slot value, but require a server resync before another answer.
    if (pending?.field && !needsResume && (body.answer !== undefined || body.skip || body.finalize)) {
      const id = pending.field;
      setAnswers(previous => ({ ...previous, [target]: { ...previous[target], [id]: { label: pending.label ?? pending.name ?? id, value: body.answer ?? "" } } }));
    }
    const result = await api<Message>(`${base}/messages`, post({ document_id: documentId, ...body }));
    if (!alive.current) return;
    await inspect(result.request_id);
    setNeedsResume(false);
    const user = body.answer ?? (body.skip ? "Leave this answer blank." : body.finalize ? "Finish a partial draft." : "Start / resume this form.");
    setTranscript(previous => [...previous, ...(automatic ? [] : [{ role: "You" as const, text: user }]), { role: "PapelLess", text: result.assistant_message }]);
    if (body.answer !== undefined || body.skip || body.finalize || result.field !== pending?.field) setAnswer("");
    if (result.status === "needs_input") {
      setPending(result);
      if (result.field) setAnswers(previous => ({ ...previous, [documentId]: { ...previous[documentId], [result.field!]: previous[documentId]?.[result.field!] ?? { label: result.label ?? result.name ?? result.field!, value: "" } } }));
    } else if (result.draft_id && result.preview_url && result.export_url) {
      await receiveDraft({ ...result, status: "completed", draft_id: result.draft_id, preview_url: result.preview_url, export_url: result.export_url, missing_fields: result.missing_fields ?? [] });
    }
  }
  async function sendChat(text = answer.trim()) {
    if (!text) return;
    const compare = /^(?:please\s+)?compare\b/i.test(text);
    const explain = /^(?:(?:please\s+)?(?:(?:can|could) you\s+)?(?:explain|define)\b|what (?:is|are|does)\b|what's\b)/i.test(text);
    if (compare || explain) {
      if (compare && documents.length < 2) {
        setTranscript(previous => [...previous, { role: "You", text }, { role: "PapelLess", text: "Upload at least two PDFs, then ask me to compare their evidence." }]);
        setAnswer(""); return;
      }
      const result = compare
        ? await api<Comparison>(`${base}/compare`, post())
        : await api<Explanation>(`${base}/explanations`, post({ query: text, ...(target ? { document_id: target } : {}) }));
      if (!alive.current) return;
      setTranscript(previous => [...previous, { role: "You", text }, compare
        ? { role: "PapelLess", text: "Here is the evidence across your documents.", comparison: result as Comparison }
        : { role: "PapelLess", text: (result as Explanation).assistant_message, explanation: result as Explanation }]);
      setAnswer(""); await inspect(result.request_id); return;
    }
    if (!pending || needsResume) {
      setTranscript(previous => [...previous, { role: "PapelLess", text: "Start or resume the form before sending an answer. You can still ask me to explain a service or compare documents." }]);
      return;
    }
    await turn({ answer: text });
  }
  async function buildDraft() {
    invalidateDraft();
    const values = Object.fromEntries(Object.entries(targetAnswers).map(([id, field]) => [id, field.value]));
    const result = await api<Draft>(`${base}/drafts`, post({ document_id: target, values }));
    await inspect(result.request_id); await receiveDraft(result);
  }
  async function reveal(fact: Fact) {
    const document = documents.find(d => d.id === fact.document_id);
    if (!document) throw new Error("Evidence document is not in this workspace. Reload the workspace document list.");
    const entry = await loadDocument(document);
    const id = fact.box_id ?? fact.widget_id;
    const slot = id ? findSlot(entry, id) : undefined;
    if (!slot) throw new Error("Evidence source slot was not found in the extracted structure.");
    setViewDoc(document.id); setPage(fact.page + 1);
    setSource({ documentId: document.id, page: fact.page + 1, quote: slot.text ?? fact.value, rects: [slot.rect] });
    setMobilePane("Document");
  }
  async function download(path: string, name: string, options?: RequestInit) {
    const blob = await apiBlob(path, options);
    if (!alive.current) return;
    const url = URL.createObjectURL(blob); downloadUrls.current.push(url);
    const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  }
  function evidence(facts: Fact[]) {
    return facts.map((fact, index) => <div className="api-evidence" key={`${fact.document_id}-${fact.box_id ?? fact.widget_id}-${index}`}>
      <strong>{fact.value}</strong>
      <span>{loaded[fact.document_id]?.name ?? fact.document_id} · page {fact.page + 1} · {fact.box_id ?? fact.widget_id}</span>
      <span>Source confidence: {fact.confidence === null ? "not available" : String(fact.confidence)} (original source scale)</span>
      <button className="text-button" disabled={!!busy} onClick={() => void run("Opening evidence…", () => reveal(fact))}>Show source in document</button>
    </div>);
  }

  return <div className="api-workspace">
    <a href="#api-work" className="skip-link">Skip to workspace</a>
    <header className="api-header"><Brand /><div className="api-actions">
      {documents.length > 0 && <button className="icon-button" aria-label="Workspace tools" aria-expanded={toolsOpen} aria-controls="workspace-tools" onClick={() => setToolsOpen(!toolsOpen)}><SlidersHorizontal size={18} /></button>}
      <button className="button secondary" aria-label="New workspace" disabled={!!busy} onClick={() => workspace ? setNewOpen(true) : void run("Creating workspace…", createWorkspace)}><Plus size={16} /><span className="api-new-label">New workspace</span></button>
      <button className="icon-button" aria-label={dark ? "Use light theme" : "Use dark theme"} onClick={() => setDark(!dark)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
    </div></header>
    {(error || notice || (!documents.length && busy)) && <div className="api-notices">
      <div role="status" aria-live="polite">{notice || (!documents.length ? busy : "")}</div>
      {error && <p role="alert" className="api-error">{error} Your input is retained. For a failed conversation turn, use Resume form to retrieve the current question before answering again.</p>}
    </div>}
    {!workspace ? <main id="api-work" className="api-start">
      {/* Asset pending: add the supplied pely.webp to public/ and replace this reserved slot with its image. */}
      <div className="api-mascot-slot" data-pending-asset="pely.webp" aria-hidden="true" />
      <h1>Start with a form.</h1><p>Upload a synthetic PDF, answer one question at a time, then review a separate draft.</p>
      <button className="button primary" disabled={!!busy} onClick={() => void run("Creating workspace…", createWorkspace)}>Create workspace</button>
      <form onSubmit={e => { e.preventDefault(); void run("Reopening workspace…", resume); }}>
        <label htmlFor="workspace-file">Or reopen an uploaded file</label>
        <select id="workspace-file" value={resumeId} disabled={!!busy || loadingRecent || !recentDocuments.length} onChange={e => setResumeId(e.target.value)} required>
          <option value="">{loadingRecent ? "Loading uploaded files…" : recentDocuments.length ? "Choose a PDF" : "No uploaded files yet"}</option>
          {recentDocuments.map(document => <option key={document.id} value={document.id}>{document.filename ?? `Earlier ${document.document_kind} upload`} · {new Date(document.created_at).toLocaleString()}</option>)}
        </select>
        <button className="button secondary" disabled={!!busy || !resumeId || !recentDocuments.some(document => document.id === resumeId)}>Reopen file</button>
      </form>
    </main> : <>
      <div id="workspace-tools" hidden={documents.length > 0 && !toolsOpen}>
        <div className="api-notices"><p>Workspace <code>{workspace.id}</code> — save this ID to reopen documents after refresh.</p>{request && <details><summary>Latest request: {request.status}</summary><p><code>{request.id}</code> · {request.kind} · {request.error_code ?? "no recorded error"}</p></details>}</div>
        <div className="api-toolbar">
        <div><label htmlFor="form-document">Form to complete</label><select id="form-document" disabled={!!busy || !!pending || needsResume} value={target} onChange={e => { setTarget(e.target.value); setPending(undefined); setTranscript([]); setAnswer(""); invalidateDraft(); const doc = documents.find(d => d.id === e.target.value); if (doc) void run("Opening form…", () => showDocument(doc)); }}>
          {!documents.length && <option value="">Upload a PDF first</option>}{documents.map(d => <option key={d.id} value={d.id}>{loaded[d.id]?.name ?? `${d.document_kind} · ${d.id}`}</option>)}
        </select>{pending && <small>Finish this conversation before switching forms.</small>}</div>
        <input className="sr-only" ref={fileInput} type="file" accept=".pdf,application/pdf" disabled={!!busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void run("Uploading and extracting PDF…", () => upload(file)); }} />
        <button className="button secondary" disabled={!!busy} onClick={() => fileInput.current?.click()}>Upload PDF</button>
        <button className="text-button" disabled={!!busy} onClick={() => void run("Checking local services…", async () => setHealth(await api<Health>("/health")))}>Check services</button>
        {health && <span>API {health.api} · Database {health.database} · Local inference {health.inference.reachable ? health.inference.model ?? "reachable" : "unavailable"}</span>}
      </div>
      </div>
      <div className="api-mobile-switch" aria-label="Workspace pane">{(["Work", "Document"] as const).map(p => <button key={p} className={mobilePane === p ? "active" : ""} aria-pressed={mobilePane === p} onClick={() => setMobilePane(p)}>{p}</button>)}</div>
      <main className="api-columns" id="api-work">
        <section className={`api-document api-mobile-${mobilePane === "Document" ? "visible" : "hidden"}`} aria-label="Document viewer">
          <div className="api-document-heading"><label htmlFor="view-document">Original document</label><select id="view-document" value={viewDoc} disabled={!!busy} onChange={e => { const doc = documents.find(d => d.id === e.target.value); if (doc) void run("Opening PDF…", () => showDocument(doc)); }}>
            <option value="" disabled>Choose a document</option>{documents.map(d => <option key={d.id} value={d.id}>{loaded[d.id]?.name ?? `${d.document_kind} · ${d.id}`}</option>)}
          </select></div>
          {current ? <><Suspense fallback={<p>Opening PDF…</p>}><PdfViewer key={current.document.id} bytes={current.bytes} page={page} onPage={p => { setPage(p); setSource(undefined); }} source={source} expectedPages={current.document.page_count} /></Suspense>
            <button className="text-button" disabled={!!busy} onClick={() => void run("Downloading original…", () => download(`/artifacts/${resource(current.document.id)}`, `${current.document.id}.pdf`))}>Download original PDF</button>
            <details className="api-structure"><summary>Extracted structure · {current.structure.document_kind}</summary><p>Page numbers below are displayed one-based; source IDs remain unchanged.</p>
              {current.structure.pages.map(p => <div key={p.page}><h3>Page {p.page + 1}</h3><p className="api-source-text">{p.text || "No extracted text."}</p><ul>{[...p.boxes, ...current.structure.widgets.filter(w => w.page === p.page)].map(slot => <li key={slot.id}><code>{slot.id}</code> {slot.field_name ?? slot.text} {slot.type && `(${slot.type})`}{slot.protected && " — protected"}</li>)}</ul></div>)}
            </details>
          </> : <div className="api-empty"><h2>Your original stays intact.</h2><p>Upload a PDF up to 10 MiB and 10 pages. Add more PDFs to compare their evidence.</p></div>}
        </section>
        <section className={`api-work-pane api-mobile-${mobilePane === "Work" ? "visible" : "hidden"}`} aria-label="Form workflow">
          <nav className="api-tabs" aria-label="Workspace tools">{(["Conversation", "Review"] as const).map(t => <button key={t} className={tab === t ? "active" : ""} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}</nav>
          <div className={`api-pane-content ${tab === "Conversation" ? "api-chat" : ""}`} aria-busy={!!busy}>
            {tab === "Review" && <h1 ref={heading} tabIndex={-1}>Check your draft.</h1>}
            {tab === "Conversation" && <>
              <div className="api-transcript" role="log" aria-label="Form conversation">
                {!transcript.length && <div className="api-chat-empty"><h1 ref={heading} tabIndex={-1}>{target ? "Let’s work through your form." : "Upload a form to begin."}</h1><p>{target ? "Your first question appears here automatically. You can also ask me to explain Philippine government paperwork." : "Add a PDF and I’ll guide you through it, one question at a time."}</p></div>}
                {transcript.map((message, index) => <div className={`api-message api-${message.role === "You" ? "user" : "assistant"}`} key={index}><span className="sr-only">{message.role}: </span><p>{message.text}</p>
                  {message.explanation && message.explanation.citations.length > 0 && <ul className="api-chat-sources">{message.explanation.citations.map((citation, i) => <li key={i}>{/^https:\/\//i.test(citation.url) ? <a href={citation.url} target="_blank" rel="noreferrer">{citation.feed} · {citation.term}</a> : <span>{citation.feed} · {citation.term}</span>}</li>)}</ul>}
                  {message.comparison && (message.comparison.comparisons.length ? message.comparison.comparisons.map((comparison, i) => <div className="api-comparison" key={i}><h2>{comparison.name}</h2><p>{comparison.outcome.replaceAll("_", " ")}</p>{evidence(comparison.sources)}{comparison.outcome === "conflict" && <p>Resume the form to clarify the affected field.</p>}</div>) : <p>No matching facts found. This does not mean the documents agree.</p>)}
                </div>)}
                {pending?.conflict && <div className="api-message api-assistant"><p>Conflicting sources. Your answer resolves only the current field in this form.</p>{evidence(pending.conflict.sources)}</div>}
                {needsResume && !busy && <p role="status">Resume the conversation to refresh the current question before answering.</p>}
                {busy && <div className="api-chat-status" role="status"><LoaderCircle className="api-spinner" size={18} aria-hidden="true" /><span>{busy}</span></div>}
                <div ref={conversationEnd} />
              </div>
              <div className="api-chat-footer">
                <div className="api-suggestions"><button disabled={!!busy || !target} onClick={() => void run("Explaining the form…", () => sendChat("Explain this form"))}>Explain this form</button><button disabled={!!busy || documents.length < 2} onClick={() => void run("Comparing document evidence…", () => sendChat("Compare my documents"))}>Compare my documents</button></div>
                <form className="api-composer" onSubmit={e => { e.preventDefault(); void run("Responding…", () => sendChat()); }}>
                  <label className="sr-only" htmlFor="form-answer">Message PapelLess</label><textarea id="form-answer" rows={2} placeholder={pending ? "Your answer, or ask me to explain…" : "Ask about your form…"} value={answer} onChange={e => setAnswer(e.target.value)} maxLength={4000} disabled={!!busy} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
                  <button className="api-send" aria-label="Send message" disabled={!!busy || !answer.trim()}><ArrowUp size={20} /></button>
                </form>
                <div className="api-chat-controls">{target && <button className="text-button" disabled={!!busy} onClick={() => void run("Retrieving the next question…", () => turn())}>Resume form</button>}<button className="text-button" disabled={!!busy || !pending || needsResume} onClick={() => void run("Leaving this field blank…", () => turn({ skip: true }))}>Skip field</button><button className="text-button" disabled={!!busy || !target} onClick={() => void run("Creating partial draft…", () => turn({ finalize: true }))}>Finish partial</button></div>
              </div>
            </>}
            {tab === "Review" && <>
              <p>Review answers by source slot, not semantic name. Editing invalidates the draft and its confirmation. Unresolved conflict values remain blank even after direct editing.</p>
              {!Object.keys(targetAnswers).length && <p>No editable mapped fields received yet. Start the conversation or create a draft to discover missing fields.</p>}
              {Object.entries(targetAnswers).map(([id, field]) => <div className="api-answer" key={id}><label htmlFor={`edit-${id}`}>{field.label}</label><small><code>{id}</code></small><input id={`edit-${id}`} value={field.value} maxLength={4000} disabled={!!busy} onChange={e => { const value = e.target.value; setAnswers(previous => ({ ...previous, [target]: { ...previous[target], [id]: { ...field, value } } })); invalidateDraft(); }} /></div>)}
              <button className="button primary" disabled={!!busy || !target || !!pending || needsResume} onClick={() => void run("Rendering draft…", buildDraft)}>Create / update draft</button>
              {(pending || needsResume) && <p>Resume, finish or finalize the conversation before creating an edited draft.</p>}
              {draft && <div className="api-draft"><h2>Separate PDF draft</h2>{draft.missing_fields.length ? <><p>Blank or unresolved fields:</p><ul>{draft.missing_fields.map(id => <li key={id}>{fieldLabel(id)} · <code>{id}</code></li>)}</ul></> : <p>No missing fields reported.</p>}
                {preview ? <img src={preview} alt="Backend-rendered first page of the current draft" /> : <button className="button secondary" disabled={!!busy} onClick={() => void run("Loading preview…", () => loadPreview(draft))}>Load draft preview</button>}
                <p>PNG preview shows the first page. The download contains the full PDF. No external submission.</p>
                {fullPreview ? <Suspense fallback={<p>Opening full draft…</p>}><PdfViewer bytes={fullPreview} page={draftPage} onPage={setDraftPage} expectedPages={loaded[target]?.document.page_count} /></Suspense> : <button className="button secondary" disabled={!!busy} onClick={() => void run("Opening full draft PDF…", async () => {
                  const blob = await apiBlob(draft.export_url, post());
                  if (alive.current) setFullPreview(new Uint8Array(await blob.arrayBuffer()));
                })}>Review all PDF pages</button>}
                {confirmed === draft.draft_id ? <><p className="api-confirmed">You confirmed this draft{draft.missing_fields.length ? " with blank / unresolved fields" : ""}.</p><button className="button primary" disabled={!!busy} onClick={() => void run("Exporting PDF…", () => download(draft.export_url, `${draft.draft_id}-DRAFT.pdf`, post()))}><Download size={16} />Download confirmed PDF</button></> : <button className="button primary" disabled={!!busy || !preview} onClick={() => setConfirmOpen(true)}>Confirm information</button>}
              </div>}
            </>}
          </div>
        </section>
      </main>
    </>}
    <Modal open={confirmOpen} onOpenChange={setConfirmOpen} title="Is this information correct?" description="Confirm the current rendered draft. Blank and unresolved fields remain blank; this is a separate copy, not a submission."><div className="api-actions"><button className="button primary" onClick={() => { if (draft) setConfirmed(draft.draft_id); setConfirmOpen(false); }}>Yes, confirm this draft</button><button className="button secondary" onClick={() => setConfirmOpen(false)}>No, keep reviewing</button></div></Modal>
    <Modal open={newOpen} onOpenChange={setNewOpen} title="Start a new workspace?" description="Current browser answers and conversation will be cleared. Uploaded documents remain on the local API; save the current workspace ID to reopen them."><div className="api-actions"><button className="button primary" disabled={!!busy} onClick={() => void run("Creating workspace…", createWorkspace)}>Create new workspace</button><button className="button secondary" onClick={() => setNewOpen(false)}>Keep this workspace</button></div></Modal>
  </div>;
}
