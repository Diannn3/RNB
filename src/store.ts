import { create } from "zustand";
import { useJourney } from "./journey";
import { confirmationKey, interviewComplete, validAnswer } from "./interview";
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
  confirmation?: string;
  invalidateConfirmation: () => void;
  confirmAll: () => boolean;
  setSession: (
    mode: Session["mode"],
    docs: DocumentRef[],
    fields: SemanticField[],
  ) => void;
  update: (id: string, value: string, source?: SourceSpan) => void;
  approve: (id: string) => void;
  markRequired: (id: string, required: boolean) => void;
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
export const useSession = create<Session>((set, get) => ({
  mode: "manual",
  documents: [],
  fields: [],
  selected: null,
  activeDoc: null,
  page: 1,
  epoch: 0,
  dirty: false,
  invalidateConfirmation: () => set({ confirmation: undefined }),
  confirmAll: () => {
    const current = get(); const progress = useJourney.getState().progress;
    if (!interviewComplete(current.fields, progress)) return false;
    const reviewedAt = new Date().toISOString();
    const fields = current.fields.map((f) => f.kind === "unsupported" ? f : ({ ...f, state: f.value ? "confirmed" as const : "not_applicable" as const, approval: { revision: f.revision, reviewedAt } }));
    set({ fields, confirmation: confirmationKey(current.documents, fields, progress), epoch: current.epoch + 1, dirty: true });
    return true;
  },
  setSession: (mode, documents, fields) => {
    useJourney.getState().reset();
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
      confirmation: undefined,
    }));
  },
  update: (id, value, source) =>
    set((s) => {
      const fields = s.fields.map((f) => f.id === id ? changeField(f, value, source) : f);
      const changed = fields.find((f) => f.id === id);
      const journey = useJourney.getState();
      if (changed && journey.progress[id] && validAnswer(changed, value)) journey.record(id, changed.revision, "answered");
      else journey.reopen([id]);
      return ({
      fields,
      confirmation: undefined,
      dirty: true,
      epoch: s.epoch + 1,
    }); }),
  markRequired: (id, required) =>
    set((s) => ({
      fields: s.fields.map((f) =>
        f.id === id ? { ...changeField(f, f.value, f.source), required } : f,
      ),
      dirty: true,
      confirmation: undefined,
      epoch: s.epoch + 1,
    })),
  approve: (id) =>
    set((s) => ({
      fields: s.fields.map((f) => (f.id === id ? approveField(f) : f)),
      dirty: true,
      confirmation: undefined,
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
        useJourney.getState().reset();
      if (doc?.role === "target")
        return {
          documents: [],
          fields: [],
          selected: null,
          activeDoc: null,
          source: undefined,
          page: 1,
          mode: "manual",
          analysisRevision: undefined,
          dirty: false,
          confirmation: undefined,
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
        confirmation: undefined,
        epoch: s.epoch + 1,
      };
    }),
  addDocument: (doc) =>
    set((s) => ({
      documents: [...s.documents, doc],
      confirmation: undefined,
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
        confirmation: undefined,
        epoch: s.epoch + 1,
      };
    }),
  clear: () => {
    useJourney.getState().reset();
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
      confirmation: undefined,
      epoch: s.epoch + 1,
    }));
  },
  applyAnalysis: (fields, analysisRevision) => {
    useJourney.getState().reopen(fields.map((f) => f.id));
    set((s) => ({
      fields,
      confirmation: undefined,
      analysisRevision,
      selected: fields[0]?.id ?? null,
      dirty: true,
      epoch: s.epoch + 1,
    })); },
}));
