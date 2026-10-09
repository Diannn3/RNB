import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowRight, Check, FileText, Send, Square } from "lucide-react";
import { Evidence, Modal } from "./components";
import { useSession } from "./store";
import { useJourney } from "./journey";
import { getPaperworkAgent, turnSchema, type AnswerProposal, type SourceSpan } from "./domain";
import { sampleTurn } from "./sample";

export default function ConversationPage({ documentPane, onReview, onAdd, onSource }: {
  documentPane: ReactNode;
  onReview: () => void;
  onAdd: () => void;
  onSource: (source: SourceSpan) => void;
}) {
  const session = useSession();
  const chat = useJourney();
  const target = session.documents.find((d) => d.role === "target")!;
  const [answer, setAnswer] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [retryText, setRetryText] = useState("");
  const [proposals, setProposals] = useState<AnswerProposal[]>([]);
  const [showDocument, setShowDocument] = useState(false);
  const [latest, setLatest] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const controller = useRef<AbortController | undefined>(undefined);
  const generation = useRef(0);
  const field = session.fields.find((f) => f.id === chat.question?.fieldId) ?? session.fields.find((f) => !chat.skipped.includes(f.id) && f.kind !== "unsupported" && (!f.value || f.state === "conflict")) ?? session.fields.find((f) => !chat.skipped.includes(f.id) && f.state === "candidate");
  const adapter = getPaperworkAgent();
  const connected = session.mode === "sample" || (adapter.capabilities.conversation && adapter.capabilities.model === "ready" && adapter.capabilities.route === "local" && !!adapter.turn);
  useEffect(() => { useJourney.getState().setRunning(running); return () => useJourney.getState().setRunning(false); }, [running]);
  useEffect(() => {
    if (!useJourney.getState().messages.length) useJourney.getState().append({
      id: crypto.randomUUID(), role: "assistant",
      text: session.mode === "sample" ? `This fictional application has ${session.fields.length} fields. We can compare the two address records, collect the missing email and check the suggestions together.` : connected ? `Your form has ${session.fields.length} fields. The local agent can help answer questions and propose source-linked answers. You will review every answer before export.` : `Your form has ${session.fields.length} editable or manually added fields. I can guide you through them. The AI agent is not connected, so semantic questions about your PDF are unavailable. You can inspect the document at any time.`,
    });
  }, []);
  useEffect(() => { setAnswer(""); }, [field?.id]);
  useEffect(() => {
    if (follow.current && log.current) log.current.scrollTop = log.current.scrollHeight;
    else setLatest(true);
  }, [chat.messages, field?.id]);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  useEffect(() => {
    // A document/field change supersedes any pending response.
    generation.current++; controller.current?.abort(); setRunning(false); setProposals([]);
  }, [session.epoch]);
  function reveal(source: SourceSpan) { onSource(source); setShowDocument(true); }
  function submitAnswer(value: string, source?: SourceSpan) {
    if (!field || !value.trim()) return;
    session.update(field.id, value.trim(), source);
    chat.skip(field.id);
    chat.setQuestion(undefined);
    chat.append({ id: crypto.randomUUID(), role: "user", text: `${field.label}: ${value.trim()}` });
    chat.append({ id: crypto.randomUUID(), role: "assistant", text: "Added to your answers. You will check and approve it in Verification.", sources: source ? [source] : undefined });
    setAnswer(""); follow.current = true;
  }
  async function ask(text: string, retry = false) {
    if (!text.trim() || running) return;
    setError(""); setRetryText(text); follow.current = true;
    if (!retry) chat.append({ id: crypto.randomUUID(), role: "user", text });
    chat.setComposer("");
    if (!connected) {
      chat.append({ id: crypto.randomUUID(), role: "assistant", text: "PDF interpretation is unavailable until the local AI agent connects. Open the document to read it, or answer the current form question below." });
      return;
    }
    const c = new AbortController(); controller.current = c;
    const ticket = ++generation.current;
    const state = useSession.getState(); const epoch = state.epoch;
    setRunning(true);
    try {
      const input = { requestId: crypto.randomUUID(), epoch, target, supporting: state.documents.filter((d) => d.role === "support"), analysisRevision: state.analysisRevision, fields: state.fields, messages: useJourney.getState().messages, questionId: field?.id, text };
      const result = turnSchema.parse(await (state.mode === "sample" ? sampleTurn(input, c.signal) : adapter.turn!(input, c.signal)));
      if (c.signal.aborted || ticket !== generation.current || epoch !== useSession.getState().epoch) return;
      if (result.documentHash !== target.hash || (state.analysisRevision && result.analysisRevision !== state.analysisRevision)) throw new Error("The reply belongs to a different document revision. Retry your question.");
      if (result.question && !state.fields.some((f) => f.id === result.question!.fieldId)) throw new Error("The reply references an unknown question.");
      const sources = [...(result.message.sources ?? []), ...(result.proposals?.flatMap((p) => p.source ? [p.source] : []) ?? [])];
      for (const source of sources) {
        if (c.signal.aborted) throw new DOMException("Cancelled", "AbortError");
        const doc = state.documents.find((d) => d.id === source.documentId);
        if (!doc || source.page > doc.pages || !source.quote.trim()) throw new Error("The reply contains an unavailable source.");
        const { pdfjs } = await import("react-pdf");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const task = pdfjs.getDocument({ data: doc.bytes.slice() });
        const abortRead = () => { void task.destroy(); };
        c.signal.addEventListener("abort", abortRead, { once: true });
        try {
          const pdf = await task.promise; const page = await pdf.getPage(source.page); const content = await page.getTextContent();
          const normalize = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
          if (!normalize(content.items.map((i) => "str" in i ? i.str : "").join(" ")).includes(normalize(source.quote))) throw new Error("The reply's quotation could not be found in your document.");
        } finally { c.signal.removeEventListener("abort", abortRead); await task.destroy(); }
      }
      if (c.signal.aborted || ticket !== generation.current || epoch !== useSession.getState().epoch) return;
      for (const p of result.proposals ?? []) {
        const f = state.fields.find((f) => f.id === p.fieldId);
        if (!f || f.revision !== p.expectedRevision || f.kind === "unsupported" || (f.kind === "checkbox" && !["", "Yes", "No"].includes(p.value)) || ((f.kind === "radio" || f.kind === "dropdown") && p.value && !f.options?.includes(p.value))) throw new Error("An answer proposal is outdated or incompatible with this field.");
      }
      chat.append(result.message); setProposals(result.proposals ?? []); chat.setQuestion(result.question);
    } catch (e) {
      if (!c.signal.aborted && ticket === generation.current) setError(e instanceof Error ? e.message : "The reply failed. Retry your question.");
    } finally { if (ticket === generation.current) setRunning(false); }
  }
  function stop() { generation.current++; controller.current?.abort(); setRunning(false); setError("Response stopped. Your answers are unchanged."); }
  return <div className="conversation-layout">
    <section className="conversation-main">
      <div className="stage-heading"><h1 tabIndex={-1}>Let's work through your form.</h1><p>{session.mode === "sample" ? "Guided fictional sample" : connected ? "Local paperwork agent" : "Guided manual interview"} · {target.name}</p></div>
      <div className="conversation-log" role="log" aria-label="Conversation" ref={log} onScroll={() => {
        const el = log.current!; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
        if (follow.current) setLatest(false);
      }}>
        {chat.messages.map((m) => <article className={`chat-message ${m.role}`} key={m.id}><strong>{m.role === "user" ? "You" : "PapelLess"}</strong><p>{m.text}</p>{m.sources?.map((s, i) => {
          const doc = session.documents.find((d) => d.id === s.documentId);
          return doc ? <Evidence key={i} quote={s.quote} name={doc.name} page={s.page} onReveal={() => reveal(s)} /> : <p key={i}>Source no longer available. This reply needs renewed review.</p>;
        })}</article>)}
      </div>
      {latest && <button className="text-button latest-message" onClick={() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "instant" }); follow.current = true; setLatest(false); }}>Latest message <ArrowDown size={16} /></button>}
      {proposals.map((p) => <div className="chat-proposal" key={p.fieldId}><strong>{session.fields.find((f) => f.id === p.fieldId)?.label}</strong><p>{p.value}</p><button className="button secondary" onClick={() => { const f = useSession.getState().fields.find((f) => f.id === p.fieldId); if (f?.revision === p.expectedRevision) session.update(p.fieldId, p.value, p.source); }}>Use this answer <Check size={16} /></button></div>)}
      {field ? <form className="interview-question" onSubmit={(e) => { e.preventDefault(); submitAnswer(answer); }}>
        <h2>{chat.question?.fieldId === field.id ? chat.question.prompt : field.question ?? `What should we use for ${field.label.toLowerCase()}?`}</h2>
        {field.conflict && <><p>{field.conflict.explanation}</p>{field.conflict.alternatives.map((a, i) => <div className="interview-choice" key={i}>{a.source && <Evidence quote={a.source.quote} name={session.documents.find((d) => d.id === a.source!.documentId)?.name} page={a.source.page} onReveal={() => reveal(a.source!)} />}<button type="button" className="button secondary" onClick={() => submitAnswer(a.value, a.source)}>{a.value} <ArrowRight size={15} /></button></div>)}</>}
        {field.value && <div className="interview-choice"><p>{field.state === "candidate" ? "Suggested" : "Current answer"}: <strong>{field.value}</strong></p>{field.source && <Evidence quote={field.source.quote} name={session.documents.find((d) => d.id === field.source!.documentId)?.name} page={field.source.page} onReveal={() => reveal(field.source!)} />}<button type="button" className="button secondary" onClick={() => submitAnswer(field.value, field.source)}>Use this answer <Check size={16} /></button></div>}
        <label htmlFor="interview-answer">Your answer{field.required ? " (required)" : " (optional)"}</label>
        {field.kind === "checkbox" || field.kind === "radio" || field.kind === "dropdown" ? <select id="interview-answer" value={answer} onChange={(e) => setAnswer(e.target.value)}><option value="">Choose an answer</option>{(field.kind === "checkbox" ? ["Yes", "No"] : field.options ?? []).map((o) => <option key={o}>{o}</option>)}</select> : <input id="interview-answer" value={answer} maxLength={20000} onChange={(e) => setAnswer(e.target.value)} />}
        <div className="interview-actions"><button className="button primary" disabled={!answer.trim() || running}>Add answer <ArrowRight size={16} /></button><button type="button" className="text-button" onClick={() => { chat.skip(field.id); chat.setQuestion(undefined); chat.append({ id: crypto.randomUUID(), role: "assistant", text: `${field.label} is left for Verification.` }); }}>Skip for now</button></div>
      </form> : <div className="interview-question"><h2>Your answers are ready to check.</h2><p>You can still ask about the PDF or add a separate answer.</p><button className="text-button" onClick={onAdd}>Add an answer</button></div>}
      <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); void ask(chat.composer); }}>
        <label htmlFor="chat-input">Ask about your PDF</label><textarea id="chat-input" rows={2} value={chat.composer} maxLength={20000} placeholder={session.mode === "sample" ? "Why are there two addresses?" : "Ask a question about your form…"} onChange={(e) => chat.setComposer(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(chat.composer); } }} />
        {running ? <button type="button" className="button secondary" onClick={stop}><Square size={15} /> Stop response</button> : <button className="button secondary" disabled={!chat.composer.trim()}><Send size={16} /> Send question</button>}
      </form>
      {running && <p role="status">Preparing a reply…</p>}{error && <div className="error-box" role="alert">{error}<button className="text-button" onClick={() => void ask(retryText, true)}>Retry question</button></div>}
    </section>
    <aside className="conversation-context"><button className="button secondary" onClick={() => setShowDocument(true)}><FileText size={17} /> Open documents</button><h2>Your answer summary</h2><p>{session.fields.filter((f) => !!f.value).length} of {session.fields.length} answered. Human review comes next.</p><ul>{session.fields.map((f) => <li key={f.id}><strong>{f.label}</strong><span>{f.value || "Not provided"}</span><button className="text-button" aria-label={`Change ${f.label}`} onClick={() => { chat.setQuestion({ fieldId: f.id, prompt: `What should we use for ${f.label.toLowerCase()}?` }); }}>Change</button></li>)}</ul><button className="text-button" onClick={onAdd}>Add an answer</button><button className="button primary" disabled={running} onClick={onReview}>Review answers <ArrowRight size={17} /></button></aside>
    <Modal open={showDocument} onOpenChange={setShowDocument} title="Your documents" description="Read the original form and supporting evidence. Your conversation stays here."><div className="conversation-document">{documentPane}</div></Modal>
  </div>;
}
