import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUp, FileText, Square } from "lucide-react";
import { Evidence, Modal } from "./components";
import { useSession } from "./store";
import { useJourney } from "./journey";
import { getPaperworkAgent, turnSchema, type SourceSpan, type ConversationMessage } from "./domain";
import { sampleTurn } from "./sample";
import { interviewComplete, pendingFields, validAnswer } from "./interview";

const ambiguous = (text: string) => /\?|^(why|how|what|when|where|can you|could you|is this|does this|explain|summarize|summarise|tell me|show me|translate|help)\b|\b(not sure|don't know|do not know|confused)\b/i.test(text.trim());
export default function ConversationPage({ documentPane, onReview, onAdd, onSource, ready }: {
  documentPane: ReactNode; onReview: () => void; onAdd: () => void; onSource: (source: SourceSpan) => void; ready: boolean;
}) {
  const session = useSession(); const chat = useJourney();
  const target = session.documents.find((d) => d.role === "target")!;
  const queue = pendingFields(session.fields, chat.progress);
  const field = ready ? queue.find((f) => f.id === chat.question?.fieldId) ?? queue[0] : undefined;
  const complete = ready && interviewComplete(session.fields, chat.progress);
  const activeQuestionId = [...chat.messages].reverse().find((m) => m.purpose === "question" && m.fieldId === field?.id && m.fieldRevision === field?.revision)?.id;
  const editable = session.fields.filter((f) => f.kind !== "unsupported");
  const [running, setRunning] = useState(false); const [error, setError] = useState("");
  const [retryText, setRetryText] = useState(""); const [uncertain, setUncertain] = useState<{ text: string; fieldId: string; revision: number }>();
  const [showDocument, setShowDocument] = useState(false); const [latest, setLatest] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const log = useRef<HTMLDivElement>(null); const input = useRef<HTMLTextAreaElement>(null); const follow = useRef(true);
  const controller = useRef<AbortController | undefined>(undefined); const generation = useRef(0);
  const adapter = getPaperworkAgent();
  const connected = adapter.capabilities.conversation && adapter.capabilities.model === "ready" && adapter.capabilities.route === "local" && !!adapter.turn;
  const append = (message: Omit<ConversationMessage, "id">, id: string = crypto.randomUUID()) => useJourney.getState().append({ ...message, id });
  useEffect(() => { useJourney.getState().setRunning(running); return () => useJourney.getState().setRunning(false); }, [running]);
  useEffect(() => {
    if (!ready) return;
    if (!useJourney.getState().messages.length) append({ role: "assistant", text: session.mode === "sample" ? "Let's complete this fictional application together. I'll ask one question at a time, then you can check everything before exporting." : connected ? "Let's work through your form, one question at a time. You can also ask about the document." : "Let's work through your form, one question at a time. This is a manual interview; PDF interpretation becomes available when the local AI agent connects." });
    if (field) {
      const question = field.question ?? `What should we use for ${field.label.toLowerCase()}?`;
      const messages = useJourney.getState().messages;
      const previous = messages.map((m, i) => ({ m, i })).reverse().find(({ m }) => m.purpose === "question" && m.fieldId === field.id && m.fieldRevision === field.revision);
      const needsNewTurn = !previous || messages.slice(previous.i + 1).some((m) => m.role === "user" && m.purpose === "answer" && m.fieldId === field.id);
      if (needsNewTurn) append({ role: "assistant", purpose: "question", fieldId: field.id, fieldRevision: field.revision, text: question });
    } else if (complete) append({ role: "assistant", purpose: "completion", text: "Your answers are ready to check." }, `completion:${JSON.stringify(session.fields.map((f) => [f.id, f.revision]))}`);
  }, [field?.id, field?.revision, complete, ready]);
  useEffect(() => { if (follow.current && log.current) log.current.scrollTop = log.current.scrollHeight; else setLatest(true); }, [chat.messages, running]);
  useEffect(() => { if (input.current) { input.current.style.height = "auto"; input.current.style.height = `${Math.min(input.current.scrollHeight, 160)}px`; } }, [chat.composer]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => { document.documentElement.style.setProperty("--chat-keyboard-inset", `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`); };
    viewport?.addEventListener("resize", resize); resize();
    return () => { viewport?.removeEventListener("resize", resize); document.documentElement.style.removeProperty("--chat-keyboard-inset"); };
  }, []);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  useEffect(() => { generation.current++; controller.current?.abort(); setRunning(false); setUncertain(undefined); }, [session.epoch]);
  function reveal(source: SourceSpan) { onSource(source); setShowDocument(true); }
  function accept(value: string, source?: SourceSpan, alreadySent = false) {
    if (!field || !validAnswer(field, value.trim())) { setError("Choose a valid answer for this field before continuing."); return; }
    const text = value.trim(); const id = field.id;
    if (!alreadySent) append({ role: "user", text, purpose: "answer", fieldId: id, fieldRevision: field.revision });
    else useJourney.getState().bindLastAnswer(id, field.revision);
    session.update(id, text, source);
    const updated = useSession.getState().fields.find((f) => f.id === id)!;
    useJourney.getState().record(id, updated.revision, "answered"); useJourney.getState().setQuestion(undefined);
    setError(""); setUncertain(undefined); chat.setComposer(""); follow.current = true; input.current?.focus();
  }
  function leaveBlank() {
    if (!field || field.required) return;
    append({ role: "user", text: "Leave blank", purpose: "answer", fieldId: field.id, fieldRevision: field.revision });
    session.update(field.id, ""); const updated = useSession.getState().fields.find((f) => f.id === field.id)!;
    chat.record(field.id, updated.revision, "explicit_blank"); chat.setQuestion(undefined); chat.setComposer(""); follow.current = true;
  }
  async function validateSources(sources: SourceSpan[], signal: AbortSignal) {
    const { pdfjs } = await import("react-pdf");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    for (const source of sources) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const doc = useSession.getState().documents.find((d) => d.id === source.documentId);
      if (!doc || source.page > doc.pages || !source.quote.trim()) throw new Error("The reply references an unavailable source.");
      const task = pdfjs.getDocument({ data: doc.bytes.slice() }); const abort = () => { void task.destroy(); };
      signal.addEventListener("abort", abort, { once: true });
      try { const pdf = await task.promise; const content = await (await pdf.getPage(source.page)).getTextContent(); const normalize = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim(); if (!normalize(content.items.map((i) => "str" in i ? i.str : "").join(" ")).includes(normalize(source.quote))) throw new Error("The reply's quotation could not be found in your document."); }
      finally { signal.removeEventListener("abort", abort); await task.destroy(); }
    }
  }
  async function send(text: string, retry = false, forceQuestion = false) {
    if (!text.trim() || running || !ready) return;
    setError(""); setRetryText(text); follow.current = true;
    if (!retry) append({ role: "user", text, purpose: "reply" });
    chat.setComposer("");
    if (!connected && session.mode !== "sample") {
      if (forceQuestion) { append({ role: "assistant", text: "PDF interpretation is unavailable until the local AI agent connects. You can open the document to inspect it. Your current question is still waiting for an answer." }); setUncertain(undefined); return; }
      if (field && !ambiguous(text) && validAnswer(field, text.trim())) { accept(text, undefined, true); return; }
      if (field) { setUncertain({ text, fieldId: field.id, revision: field.revision }); append({ role: "assistant", text: "Should I use this as your answer, or are you asking about the PDF?" }); }
      else append({ role: "assistant", text: "PDF interpretation is unavailable until the local AI agent connects. Open your documents to inspect them." });
      return;
    }
    if (session.mode === "sample" && field && !forceQuestion && !ambiguous(text) && validAnswer(field, text.trim())) { accept(text, undefined, true); return; }
    const c = new AbortController(); controller.current = c; const ticket = ++generation.current;
    const state = useSession.getState(); const epoch = state.epoch; setRunning(true);
    try {
      const request = { requestId: crypto.randomUUID(), epoch, target, supporting: state.documents.filter((d) => d.role === "support"), analysisRevision: state.analysisRevision, fields: state.fields, messages: useJourney.getState().messages, questionId: field?.id, text };
      const result = turnSchema.parse(await (state.mode === "sample" ? sampleTurn(request, c.signal) : adapter.turn!(request, c.signal)));
      if (c.signal.aborted || ticket !== generation.current || epoch !== useSession.getState().epoch) return;
      if (result.documentHash !== target.hash || (state.analysisRevision && result.analysisRevision !== state.analysisRevision)) throw new Error("This reply belongs to an older document revision. Retry your message.");
      const answer = result.intent === "answer" ? result.answer : undefined;
      if (result.intent === "answer" && (!answer || !field || answer.fieldId !== field.id || answer.expectedRevision !== field.revision || !validAnswer(field, answer.value))) throw new Error("The reply did not provide a valid answer for the current question.");
      await validateSources([...(result.message.sources ?? []), ...(answer?.source ? [answer.source] : [])], c.signal);
      if (c.signal.aborted || ticket !== generation.current || epoch !== useSession.getState().epoch) return;
      append(result.message, result.message.id);
      if (answer) accept(answer.value, answer.source, true);
      else if (result.question && field && result.question.fieldId === field.id) { chat.setQuestion(result.question); append({ role: "assistant", text: result.question.prompt, purpose: "reply" }); }
      if (!result.intent && state.mode !== "sample" && field) setUncertain({ text, fieldId: field.id, revision: field.revision });
    } catch (e) { if (!c.signal.aborted && ticket === generation.current) setError(e instanceof Error ? e.message : "The reply failed. Retry your message."); }
    finally { if (ticket === generation.current) setRunning(false); }
  }
  function stop() { generation.current++; controller.current?.abort(); setRunning(false); setError("Response stopped. Your answers are unchanged."); }
  return <section className="interview-chat" onClickCapture={(e) => { if (!showDocument && e.target instanceof Element) { const button = e.target.closest("button"); if (button) returnFocus.current = button; } }}>
    <header className="chat-title"><h1 tabIndex={-1}>Your paperwork interview</h1><p>{target.name}{session.mode === "sample" ? " · Fictional sample" : ""}</p><button className="chat-document-button" onClick={() => setShowDocument(true)}><FileText size={17} /> Documents</button></header>
    <div className="interview-transcript" role="log" aria-label="Conversation" ref={log} onScroll={() => { const el = log.current!; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70; if (follow.current) setLatest(false); }}>
      <div className="interview-messages">{chat.messages.map((m) => {
        const active = !running && m.id === activeQuestionId;
        return <article className={`interview-message ${m.role}`} key={m.id}><span className="sr-only">{m.role === "user" ? "You" : "PapelLess"}</span><p>{m.text}</p>{m.sources?.map((s, i) => { const doc = session.documents.find((d) => d.id === s.documentId); return doc ? <Evidence key={i} quote={s.quote} name={doc.name} page={s.page} onReveal={() => reveal(s)} /> : <p key={i}>Source no longer available. Check this reply again.</p>; })}
        {active && field && <div className="inline-question-controls">
          {field.conflict && <><p>{field.conflict.explanation}</p>{field.conflict.alternatives.map((a, i) => <div key={i}>{a.source && <Evidence quote={a.source.quote} name={session.documents.find((d) => d.id === a.source!.documentId)?.name} page={a.source.page} onReveal={() => reveal(a.source!)} />}<button className="chat-choice" onClick={() => accept(a.value, a.source)}>{a.value}</button></div>)}</>}
          {field.value && !field.conflict && <div>{field.source && <Evidence quote={field.source.quote} name={session.documents.find((d) => d.id === field.source!.documentId)?.name} page={field.source.page} onReveal={() => reveal(field.source!)} />}<p className="chat-suggestion">Detected answer: {field.value}</p><button className="chat-choice" onClick={() => accept(field.value, field.source)}>Use {field.value}</button></div>}
          {(field.kind === "checkbox" ? ["Yes", "No"] : field.kind === "radio" || field.kind === "dropdown" ? field.options ?? [] : []).map((value) => <button className="chat-choice" key={value} onClick={() => accept(value)}>{value}</button>)}
          {!field.required && <button className="chat-text-button" onClick={leaveBlank}>Leave blank</button>}
        </div>}
        {m.role === "user" && m.fieldId && <button className="chat-text-button edit-reply" disabled={running} onClick={() => { const f = session.fields.find((f) => f.id === m.fieldId); if (f) { chat.reopen(editable.slice(editable.findIndex((item) => item.id === f.id)).map((item) => item.id)); chat.setQuestion({ fieldId: f.id, prompt: `What should we use for ${f.label.toLowerCase()}?` }); append({ role: "assistant", purpose: "question", fieldId: f.id, fieldRevision: f.revision, text: `What should we use for ${f.label.toLowerCase()}?` }); session.invalidateConfirmation(); chat.setComposer(f.value); follow.current = true; input.current?.focus(); } }}>Edit answer</button>}
        </article>;
      })}
      {!editable.length && <div className="chat-setup"><p>This PDF has no editable fields. Add the questions you want to answer before continuing.</p><button className="chat-choice" onClick={onAdd}>Add a question</button></div>}
      {session.fields.some((f) => f.kind === "unsupported") && <p className="chat-limit">Unsupported fields remain unchanged and are excluded from this interview.</p>}
      {uncertain && field?.id === uncertain.fieldId && field.revision === uncertain.revision && <div className="intent-choices"><button className="chat-choice" disabled={!validAnswer(field, uncertain.text.trim())} onClick={() => accept(uncertain.text, undefined, true)}>Use as answer</button><button className="chat-choice" onClick={() => void send(uncertain.text, true, true)}>Ask about PDF</button></div>}
      {complete && <div className="chat-completion"><button className="button primary" disabled={running} onClick={onReview}>Review my answers <ArrowRight size={17} /></button><button className="chat-text-button" onClick={onAdd}>Add a question</button></div>}
      {running && <p role="status" className="chat-status">Preparing a reply…</p>}{error && <div role="alert" className="chat-error">{error}{retryText && <button className="chat-text-button" onClick={() => void send(retryText, true)}>Retry message</button>}</div>}
      </div>
    </div>
    <footer className="interview-footer">{latest && <button className="chat-latest" onClick={() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "instant" }); follow.current = true; setLatest(false); }}>Latest message <ArrowDown size={15} /></button>}
      <form className="interview-composer" onSubmit={(e) => { e.preventDefault(); void send(chat.composer); }}><label htmlFor="interview-message" className="sr-only">Message</label><textarea ref={input} id="interview-message" rows={1} value={chat.composer} maxLength={20000} placeholder={field ? "Type your answer, or ask about the document…" : "Message PapelLess…"} onChange={(e) => chat.setComposer(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(chat.composer); } }} />{running ? <button type="button" className="chat-send" aria-label="Stop response" onClick={stop}><Square size={17} /></button> : <button className="chat-send" aria-label="Send message" disabled={!ready || !chat.composer.trim()}><ArrowUp size={19} /></button>}</form>
      <p className="chat-progress">{editable.length - queue.length} of {editable.length} questions handled{field ? ` · ${field.required ? "Required answer" : "Optional answer"}` : ""}</p>
    </footer>
    <Modal finalFocus={returnFocus} open={showDocument} onOpenChange={setShowDocument} title="Your documents" description="Your conversation and message draft stay here."><div className="conversation-document">{documentPane}</div></Modal>
  </section>;
}
