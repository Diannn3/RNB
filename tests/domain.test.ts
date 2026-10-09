import { describe, it, expect } from "vitest";
import {
  approveField,
  changeField,
  isApproved,
  projectSchema,
  restoreFields,
  sourceSchema,
  type SemanticField,
  type DocumentRef,
} from "../src/domain";
import { useSession } from "../src/store";
const hash = "a".repeat(64);
const f: SemanticField = {
  id: "name",
  label: "Name",
  kind: "text",
  required: true,
  value: "Alex",
  state: "candidate",
  revision: 1,
  source: { documentId: "source", page: 1, quote: "Name: Alex" },
};
const doc = (
  id: string,
  role: "target" | "support" = "target",
): DocumentRef => ({
  id,
  role,
  name: id + ".pdf",
  hash,
  bytes: new Uint8Array(),
  pages: 1,
  support: "fillable",
});
describe("review integrity", () => {
  it("editing invalidates approval and source", () => {
    const approved = approveField(f);
    expect(isApproved(approved)).toBe(true);
    const changed = changeField(approved, "Bea");
    expect(isApproved(changed)).toBe(false);
    expect(changed.source).toBeUndefined();
  });
  it("unanswered and conflict fields cannot be approved", () => {
    expect(isApproved(approveField({ ...f, value: "" }))).toBe(false);
    expect(isApproved(approveField({ ...f, state: "conflict" }))).toBe(false);
  });
  it("removing evidence invalidates all related review", () => {
    useSession
      .getState()
      .setSession(
        "manual",
        [doc("target"), doc("source", "support")],
        [approveField(f)],
      );
    useSession.getState().remove("source");
    expect(isApproved(useSession.getState().fields[0])).toBe(false);
    expect(useSession.getState().fields[0].source).toBeUndefined();
  });
  it("new sessions remove synthetic answers", () => {
    useSession.getState().setSession("sample", [doc("target")], [f]);
    useSession.getState().setSession("manual", [doc("real")], []);
    expect(useSession.getState().fields).toEqual([]);
  });
});
describe("project restoration", () => {
  const project = () =>
    projectSchema.parse({
      schemaVersion: 1,
      mode: "manual",
      documents: [
        { id: "target", name: "target.pdf", hash, role: "target" },
        { id: "source", name: "source.pdf", hash, role: "support" },
      ],
      fields: [approveField(f)],
    });
  it("matching documents preserve review", () =>
    expect(
      isApproved(
        restoreFields(
          project(),
          [doc("target"), doc("source", "support")],
          [f],
        )[0],
      ),
    ).toBe(true));
  it("missing sources require review again", () =>
    expect(isApproved(restoreFields(project(), [doc("target")], [f])[0])).toBe(
      false,
    ));
  it("changed target preserves manual answer without binding geometry", () => {
    const result = restoreFields(
      project(),
      [{ ...doc("target"), hash: "b".repeat(64) }],
      [f],
    );
    expect(result[0].value).toBe("Alex");
    expect(isApproved(result[0])).toBe(false);
  });
  it("keeps actual fields omitted by saved data", () => {
    const p = project();
    p.fields = [];
    expect(restoreFields(p, [doc("target")], [f]).map((x) => x.id)).toEqual([
      "name",
    ]);
  });
  it("rejects saved options absent from actual PDF metadata", () => {
    const actual = {
      ...f,
      kind: "dropdown" as const,
      options: ["Laguna"],
      value: "",
    };
    const restored = restoreFields(
      project(),
      [doc("target"), doc("source", "support")],
      [actual],
    )[0];
    expect(restored.value).toBe("");
    expect(isApproved(restored)).toBe(false);
  });
  it("invalidates forged approval revisions", () => {
    const p = project();
    p.fields[0].approval!.revision = 999;
    expect(
      isApproved(
        restoreFields(p, [doc("target"), doc("source", "support")], [f])[0],
      ),
    ).toBe(false);
  });
  it("rejects unknown versions and duplicate IDs", () => {
    expect(() =>
      projectSchema.parse({ ...project(), schemaVersion: 3 }),
    ).toThrow();
    expect(() =>
      projectSchema.parse({ ...project(), fields: [f, f] }),
    ).toThrow();
  });
});

describe("integration metadata", () => {
  it("preserves valid PDF geometry and rejects invalid coordinates", () => {
    const span = {
      documentId: "source",
      page: 1,
      quote: "Alex",
      rects: [[10, 20, 100, 35]],
    };
    expect(sourceSchema.parse(span).rects).toEqual(span.rects);
    expect(() =>
      sourceSchema.parse({ ...span, rects: [[10, 20, Infinity, 35]] }),
    ).toThrow();
  });
  it("tracks analysis revision and clears it with the session", () => {
    useSession.getState().applyAnalysis([f], "revision-2");
    expect(useSession.getState().analysisRevision).toBe("revision-2");
    useSession.getState().clear();
    expect(useSession.getState().analysisRevision).toBeUndefined();
  });
});
