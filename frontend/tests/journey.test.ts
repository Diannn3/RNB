import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { useJourney } from "../src/journey";
import { useSession } from "../src/store";
import { projectSchema, turnSchema, type SemanticField } from "../src/domain";
import { exportDraft, sampleDocuments } from "../src/pdf";
describe("guided journey integrity", () => {
  it("deduplicates retries and clears conversation with the session", () => {
    useJourney.getState().reset();
    const m = { id: "one", role: "user" as const, text: "My answer" };
    useJourney.getState().append(m); useJourney.getState().append(m);
    useJourney.getState().setComposer("private draft");
    expect(useJourney.getState().messages).toHaveLength(1);
    useSession.getState().clear();
    expect(useJourney.getState().messages).toEqual([]);
    expect(useJourney.getState().composer).toBe("");
  });
  it("validates v1 and v2 projects without storing pending requests", () => {
    const base = { mode: "manual", documents: [{ id: "target", name: "form.pdf", hash: "a".repeat(64), role: "target" }], fields: [] };
    expect(projectSchema.parse({ ...base, schemaVersion: 1 }).schemaVersion).toBe(1);
    const p = projectSchema.parse({ ...base, schemaVersion: 2, stage: "export", running: true, messages: [{ id: "a", role: "assistant", text: "Check this" }] });
    expect(p.messages).toHaveLength(1); expect(p).not.toHaveProperty("running");
  });
  it("an adapter reply cannot supply human approval", () => {
    const r = turnSchema.parse({ documentHash: "a".repeat(64), message: { id: "reply", role: "assistant", text: "Proposed" }, proposals: [{ fieldId: "name", expectedRevision: 1, value: "Alex", approval: { revision: 1 } }] });
    expect(r.proposals![0]).not.toHaveProperty("approval");
  });
  it("one writer previews current values but exports only approved values", async () => {
    const font = await readFile(new URL("../public/fonts/PlusJakartaSans-Regular.ttf", import.meta.url));
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(font));
    try {
      const sample = await sampleDocuments();
      const fields: SemanticField[] = sample.fields.map((f) => f.id === "full_name" ? { ...f, value: "María Ñ Reyes", state: "user_provided" } : f);
      const working = await PDFDocument.load(await exportDraft(sample.documents[0], fields, "working"));
      const final = await PDFDocument.load(await exportDraft(sample.documents[0], fields));
      expect(working.getForm().getTextField("full_name").getText()).toBe("María Ñ Reyes");
      expect(final.getForm().getTextField("full_name").getText() ?? "").toBe("");
      expect(sample.fields[0].value).toBe("");
    } finally { fetch.mockRestore(); }
  });
});
