import { create } from "zustand";
import {
  changeField,
  approveField,
  invalidateSource,
  type SemanticField,
  type DocumentRef,
  type SourceSpan,
} from "./domain";
interface Session {
  mode: "manual" | "sample";
  documents: DocumentRef[];
  fields: SemanticField[];
  selected: string | null;
  activeDoc: string | null;
  page: number;
  source?: SourceSpan;
  epoch: number;
  analysisRevision?: string;
  dirty: boolean;
  setSession: (
    mode: Session["mode"],
    docs: DocumentRef[],
    fields: SemanticField[],
  ) => void;
  update: (id: string, value: string, source?: SourceSpan) => void;
  approve: (id: string) => void;
  select: (id: string) => void;
  showSource: (s: SourceSpan) => void;
  showDoc: (id: string) => void;
  setPage: (page: number) => void;
  remove: (id: string) => void;
  addDocument: (doc: DocumentRef) => void;
  addField: (label: string) => void;
  clear: () => void;
  applyAnalysis: (fields: SemanticField[], revision?: string) => void;
}
export const useSession = create<Session>((set) => ({
  mode: "manual",
  documents: [],
  fields: [],
  selected: null,
  activeDoc: null,
  page: 1,
  epoch: 0,
  dirty: false,
  setSession: (mode, documents, fields) =>
    set((s) => ({
      mode,
      documents,
      fields,
      selected: fields[0]?.id ?? null,
      activeDoc: documents.find((d) => d.role === "target")?.id ?? null,
      page: 1,
      source: undefined,
      analysisRevision: undefined,
      epoch: s.epoch + 1,
      dirty: false,
    })),
  update: (id, value, source) =>
    set((s) => ({
      fields: s.fields.map((f) =>
        f.id === id ? changeField(f, value, source) : f,
      ),
      dirty: true,
      epoch: s.epoch + 1,
    })),
  approve: (id) =>
    set((s) => ({
      fields: s.fields.map((f) => (f.id === id ? approveField(f) : f)),
      dirty: true,
      epoch: s.epoch + 1,
    })),
  select: (id) => set({ selected: id }),
  showSource: (source) =>
    set({ source, activeDoc: source.documentId, page: source.page }),
  showDoc: (activeDoc) => set({ activeDoc, page: 1, source: undefined }),
  setPage: (page) => set({ page, source: undefined }),
  remove: (id) =>
    set((s) => {
      const doc = s.documents.find((d) => d.id === id);
      if (doc?.role === "target")
        return {
          documents: [],
          fields: [],
          selected: null,
          activeDoc: null,
          source: undefined,
          dirty: false,
          epoch: s.epoch + 1,
        };
      return {
        documents: s.documents.filter((d) => d.id !== id),
        fields: s.fields.map((f) => invalidateSource(f, id)),
        activeDoc:
          s.activeDoc === id
            ? (s.documents.find((d) => d.role === "target")?.id ?? null)
            : s.activeDoc,
        source: undefined,
        page: 1,
        dirty: true,
        epoch: s.epoch + 1,
      };
    }),
  addDocument: (doc) =>
    set((s) => ({
      documents: [...s.documents, doc],
      dirty: true,
      epoch: s.epoch + 1,
    })),
  addField: (label) =>
    set((s) => {
      const id = `manual:${crypto.randomUUID()}`;
      return {
        fields: [
          ...s.fields,
          {
            id,
            label,
            kind: "text",
            required: false,
            value: "",
            state: "unresolved",
            revision: 0,
          },
        ],
        selected: id,
        dirty: true,
        epoch: s.epoch + 1,
      };
    }),
  clear: () =>
    set((s) => ({
      mode: "manual",
      documents: [],
      fields: [],
      selected: null,
      activeDoc: null,
      page: 1,
      source: undefined,
      analysisRevision: undefined,
      dirty: false,
      epoch: s.epoch + 1,
    })),
  applyAnalysis: (fields, analysisRevision) =>
    set((s) => ({
      fields,
      analysisRevision,
      selected: fields[0]?.id ?? null,
      dirty: true,
      epoch: s.epoch + 1,
    })),
}));
