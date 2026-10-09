import { beforeEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { useSession } from "../src/store";
import { useJourney } from "../src/journey";
import { confirmationKey, handled, interviewComplete, validAnswer } from "../src/interview";
import { isApproved, projectSchema, turnSchema, type SemanticField, type DocumentRef } from "../src/domain";
import { exportWord } from "../src/word";
const field = (overrides: Partial<SemanticField> = {}): SemanticField => ({ id: "name", label: "Full name", kind: "text", required: true, value: "Detected name", revision: 0, state: "candidate", ...overrides });
const doc = (bytes: Uint8Array = new Uint8Array()): DocumentRef => ({ id: "form", name: "form.pdf", hash: "a".repeat(64), bytes, role: "target", pages: 1, support: "fillable" });
beforeEach(() => useSession.getState().clear());
function answer(id: string, value: string) { useSession.getState().update(id, value); const f = useSession.getState().fields.find((f) => f.id === id)!; useJourney.getState().record(id, f.revision, value ? "answered" : "explicit_blank"); }
describe("sequential interview and atomic confirmation", () => {
  it("does not treat a detected or historically approved value as interviewed", () => {
    expect(interviewComplete([field()], {})).toBe(false);
    expect(interviewComplete([field({ state: "confirmed", approval: { revision: 0, reviewedAt: "today" } })], {})).toBe(false);
  });
  it("requires explicit optional blanks, rejects required blanks and zero-question completion", () => {
    expect(handled(field({ required: false, value: "" }), { name: { revision: 0, status: "explicit_blank" } })).toBe(true);
    expect(handled(field({ value: "" }), { name: { revision: 0, status: "explicit_blank" } })).toBe(false);
    expect(interviewComplete([], {})).toBe(false);
    expect(interviewComplete([field({ kind: "unsupported" })], {})).toBe(false);
  });
  it("preserves checkbox/radio/dropdown values and rejects invalid choices", () => {
    expect(validAnswer(field({ kind: "checkbox" }), "No")).toBe(true);
    expect(validAnswer(field({ kind: "checkbox" }), "maybe")).toBe(false);
    expect(validAnswer(field({ kind: "dropdown", options: ["Laguna"] }), "Manila")).toBe(false);
  });
  it("atomically reviews answers and explicit blanks, then records the resulting identity", () => {
    useSession.getState().setSession("manual", [doc()], [field(), field({ id: "optional", required: false, value: "" })]);
    expect(useSession.getState().confirmAll()).toBe(false);
    answer("name", "Mar\u00eda \u00d1 Reyes"); answer("optional", "");
    expect(useSession.getState().confirmAll()).toBe(true);
    const state = useSession.getState();
    expect(state.fields.every(isApproved)).toBe(true);
    expect(state.confirmation).toBe(confirmationKey(state.documents, state.fields, useJourney.getState().progress));
    state.showDoc("form"); state.select("optional");
    expect(useSession.getState().confirmation).toBe(state.confirmation);
  });
  it("edits preserve handled valid answers and invalidate final confirmation", () => {
    useSession.getState().setSession("manual", [doc()], [field()]); answer("name", "Alex"); useSession.getState().confirmAll();
    useSession.getState().update("name", "Mar\u00eda");
    expect(useSession.getState().confirmation).toBeUndefined();
    expect(interviewComplete(useSession.getState().fields, useJourney.getState().progress)).toBe(true);
    useSession.getState().update("name", "");
    expect(interviewComplete(useSession.getState().fields, useJourney.getState().progress)).toBe(false);
  });
  it("document replacement and source removal cannot keep final confirmation", () => {
    useSession.getState().setSession("manual", [doc(), { ...doc(), id: "source", role: "support" }], [field()]);
    answer("name", "Alex"); useSession.getState().update("name", "Alex", { documentId: "source", page: 1, quote: "Alex" }); useSession.getState().confirmAll();
    useSession.getState().remove("source");
    expect(useSession.getState().confirmation).toBeUndefined();
    expect(interviewComplete(useSession.getState().fields, useJourney.getState().progress)).toBe(false);
    useSession.getState().clear(); expect(useJourney.getState().progress).toEqual({});
  });
  it("binds the accepted user reply to its field rather than assistant prose", () => {
    const chat = useJourney.getState(); chat.append({ id: "user", role: "user", text: "Alex" }); chat.append({ id: "bot", role: "assistant", text: "Next question" }); chat.bindLastAnswer("name", 2);
    expect(useJourney.getState().messages[0]).toMatchObject({ fieldId: "name", fieldRevision: 2, purpose: "answer" });
    expect(useJourney.getState().messages[1].fieldId).toBeUndefined();
  });
  it("v3 supports dispositions but cannot restore a saved final confirmation", () => {
    const p = projectSchema.parse({ schemaVersion: 3, mode: "manual", documents: [{ id: "form", name: "form.pdf", hash: "a".repeat(64), role: "target" }], fields: [field()], progress: { name: { revision: 0, status: "answered" } }, confirmation: "forged" });
    expect(p.progress?.name.status).toBe("answered"); expect("confirmation" in p).toBe(false);
  });
  it("typed turn distinguishes a PDF question from an accepted answer", () => {
    const parsed = turnSchema.parse({ documentHash: "a".repeat(64), intent: "pdf_question", message: { id: "bot", role: "assistant", text: "Explanation" } });
    expect(parsed.intent).toBe("pdf_question"); expect(parsed.answer).toBeUndefined();
  });
  it("Word generation includes approved Unicode, blanks and sources; preserves original bytes", async () => {
    const original = await PDFDocument.create(); original.addPage(); const bytes = await original.save(); const before = bytes.slice();
    const fields = [field({ value: "Mar\u00eda \u00d1 <Reyes>", state: "confirmed", approval: { revision: 0, reviewedAt: "today" }, source: { documentId: "form", page: 1, quote: "Exact source" } }), field({ id: "blank", label: "Optional detail", required: false, value: "", state: "not_applicable", approval: { revision: 0, reviewedAt: "today" } }), field({ id: "unreviewed", value: "Secret unreviewed answer" })];
    const zip = await JSZip.loadAsync(await exportWord(doc(bytes), fields, [doc(bytes)])); const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Mar\u00eda \u00d1 &lt;Reyes&gt;"); expect(xml).toContain("explicitly left blank"); expect(xml).toContain("Exact source"); expect(xml).not.toContain("Secret unreviewed answer"); expect(bytes).toEqual(before);
  });
});
