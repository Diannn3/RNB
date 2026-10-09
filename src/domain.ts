import { z } from "zod";
export type FieldState =
  | "unresolved"
  | "candidate"
  | "conflict"
  | "user_provided"
  | "confirmed"
  | "not_applicable"
  | "excluded";
export type FieldKind =
  | "text"
  | "checkbox"
  | "radio"
  | "dropdown"
  | "unsupported";
export interface DocumentRef {
  id: string;
  name: string;
  hash: string;
  role: "target" | "support";
  bytes: Uint8Array;
  pages: number;
  support: "fillable" | "plain" | "image" | "signed" | "xfa";
}
export interface SourceSpan {
  documentId: string;
  page: number;
  quote: string;
  /** PDF user-space rectangles: x1, y1, x2, y2. */
  rects?: [number, number, number, number][];
}
export interface CandidateAnswer {
  value: string;
  source?: SourceSpan;
}
export interface PotentialConflict {
  alternatives: CandidateAnswer[];
  explanation: string;
}
export interface InterviewQuestion {
  fieldId: string;
  prompt: string;
}
export interface Approval {
  revision: number;
  reviewedAt: string;
}
export interface SemanticField {
  id: string;
  label: string;
  kind: FieldKind;
  options?: string[];
  required: boolean;
  value: string;
  state: FieldState;
  revision: number;
  approval?: Approval;
  candidate?: CandidateAnswer;
  conflict?: PotentialConflict;
  question?: string;
  source?: SourceSpan;
}
export interface AnalysisResult {
  documentHash: string;
  analysisRevision: string;
  fields: SemanticField[];
}
export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: SourceSpan[];
}
export interface AnswerProposal {
  fieldId: string;
  expectedRevision: number;
  value: string;
  source?: SourceSpan;
}
export interface InterviewTurnInput {
  requestId: string;
  epoch: number;
  target: DocumentRef;
  supporting: DocumentRef[];
  analysisRevision?: string;
  fields: SemanticField[];
  messages: ConversationMessage[];
  questionId?: string;
  text: string;
}
export interface InterviewTurnResult {
  documentHash: string;
  analysisRevision?: string;
  message: ConversationMessage;
  proposals?: AnswerProposal[];
  question?: InterviewQuestion;
}
export interface PaperworkAgentAdapter {
  capabilities: {
    analysis: boolean;
    model: "sample" | "unavailable" | "ready";
    route: "sample" | "none" | "local";
    conversation?: boolean;
  };
  analyze(
    input: { target: DocumentRef; supporting: DocumentRef[] },
    signal: AbortSignal,
  ): Promise<AnalysisResult>;
  turn?(input: InterviewTurnInput, signal: AbortSignal): Promise<InterviewTurnResult>;
}
export const unavailableAdapter: PaperworkAgentAdapter = {
  capabilities: { analysis: false, model: "unavailable", route: "none" },
  async analyze() {
    throw new Error(
      "The paperwork agent is not connected. You can still review and fill this form manually.",
    );
  },
};
let adapter = unavailableAdapter;
export const connectPaperworkAgent = (next: PaperworkAgentAdapter) => {
  adapter = next;
};
export const getPaperworkAgent = () => adapter;
export function changeField(
  field: SemanticField,
  value: string,
  source?: SourceSpan,
): SemanticField {
  return {
    ...field,
    value,
    source,
    revision: field.revision + 1,
    approval: undefined,
    state: value ? "user_provided" : "unresolved",
  };
}
export function approveField(field: SemanticField): SemanticField {
  if (
    !field.value ||
    field.state === "conflict" ||
    field.kind === "unsupported"
  )
    return field;
  return {
    ...field,
    state: "confirmed",
    approval: {
      revision: field.revision,
      reviewedAt: new Date().toISOString(),
    },
  };
}
export const isApproved = (field: SemanticField) =>
  field.state === "confirmed" && field.approval?.revision === field.revision;
export function invalidateSource(
  field: SemanticField,
  id: string,
): SemanticField {
  const referenced =
    field.source?.documentId === id ||
    field.candidate?.source?.documentId === id ||
    field.conflict?.alternatives.some((a) => a.source?.documentId === id);
  if (!referenced) return field;
  return {
    ...changeField(
      field,
      field.value,
      field.source?.documentId === id ? undefined : field.source,
    ),
    candidate: undefined,
    conflict: undefined,
  };
}
export const sourceSchema = z.object({
  documentId: z.string().max(200),
  page: z.number().int().min(1).max(10000),
  quote: z.string().max(10000),
  rects: z
    .array(z.tuple([z.number(), z.number(), z.number(), z.number()]))
    .max(100)
    .optional(),
});
export const messageSchema = z.object({
  id: z.string().min(1).max(200),
  role: z.enum(["user", "assistant"]),
  text: z.string().max(20000),
  sources: z.array(sourceSchema).max(20).optional(),
});
export const turnSchema = z.object({
  documentHash: z.string().regex(/^[a-f0-9]{64}$/),
  analysisRevision: z.string().min(1).max(200).optional(),
  message: messageSchema.extend({ role: z.literal("assistant") }),
  proposals: z.array(z.object({
    fieldId: z.string().min(1).max(500),
    expectedRevision: z.number().int().nonnegative(),
    value: z.string().max(20000),
    source: sourceSchema.optional(),
  })).max(100).optional(),
  question: z.object({ fieldId: z.string().max(500), prompt: z.string().max(2000) }).optional(),
});
const savedField = z.object({
  id: z.string().min(1).max(500),
  label: z.string().min(1).max(500),
  kind: z.enum(["text", "checkbox", "radio", "dropdown", "unsupported"]),
  options: z.array(z.string().max(1000)).max(500).optional(),
  required: z.boolean(),
  value: z.string().max(20000),
  state: z.enum([
    "unresolved",
    "candidate",
    "conflict",
    "user_provided",
    "confirmed",
    "not_applicable",
    "excluded",
  ]),
  revision: z.number().int().nonnegative(),
  approval: z
    .object({
      revision: z.number().int().nonnegative(),
      reviewedAt: z.string().max(100),
    })
    .optional(),
  source: sourceSchema.optional(),
  candidate: z
    .object({ value: z.string().max(20000), source: sourceSchema.optional() })
    .optional(),
  question: z.string().max(2000).optional(),
  conflict: z
    .object({
      alternatives: z
        .array(
          z.object({
            value: z.string().max(20000),
            source: sourceSchema.optional(),
          }),
        )
        .max(10),
      explanation: z.string().max(2000),
    })
    .optional(),
});
export const projectSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    stage: z.enum(["upload", "conversation", "verification", "export"]).optional(),
    messages: z.array(messageSchema).max(500).optional(),
    skipped: z.array(z.string().max(500)).max(1000).optional(),
    question: z.object({ fieldId: z.string().max(500), prompt: z.string().max(2000) }).optional(),
    mode: z.enum(["manual", "sample"]),
    documents: z
      .array(
        z.object({
          id: z.string().max(200),
          name: z.string().max(500),
          hash: z.string().regex(/^[a-f0-9]{64}$/),
          role: z.enum(["target", "support"]),
        }),
      )
      .min(1)
      .max(20),
    fields: z.array(savedField).max(1000),
  })
  .superRefine((p, ctx) => {
    if (
      p.documents.filter((d) => d.role === "target").length !== 1 ||
      new Set(p.documents.map((d) => d.id)).size !== p.documents.length ||
      new Set(p.fields.map((f) => f.id)).size !== p.fields.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Project contains duplicate identifiers or an invalid target.",
      });
  });
export type SavedProject = z.infer<typeof projectSchema>;
export function restoreFields(
  project: SavedProject,
  docs: DocumentRef[],
  parsed: SemanticField[],
): SemanticField[] {
  const originalTarget = project.documents.find((d) => d.role === "target");
  const target = docs.find((d) => d.role === "target");
  const targetMatches = originalTarget?.hash === target?.hash;
  const matchedIds = new Set(
    docs
      .filter((d) =>
        project.documents.some((old) => old.id === d.id && old.hash === d.hash),
      )
      .map((d) => d.id),
  );
  const validSource = (source: SourceSpan | undefined) =>
    !source ||
    (matchedIds.has(source.documentId) &&
      source.page <=
        (docs.find((d) => d.id === source.documentId)?.pages ?? 0));
  const merge = (
    saved: SemanticField,
    actual?: SemanticField,
  ): SemanticField => {
    const sourceMatches =
      validSource(saved.source) &&
      validSource(saved.candidate?.source) &&
      (!saved.conflict ||
        saved.conflict.alternatives.every((a) => validSource(a.source)));
    const valueValid =
      !actual ||
      (actual.kind === "checkbox"
        ? ["", "Yes", "No"].includes(saved.value)
        : actual.kind === "radio" || actual.kind === "dropdown"
          ? !saved.value || !!actual.options?.includes(saved.value)
          : actual.kind !== "unsupported");
    const value = valueValid ? saved.value : (actual?.value ?? "");
    const approvalValid =
      !!value &&
      saved.approval?.revision === saved.revision &&
      saved.state === "confirmed";
    const valid = targetMatches && sourceMatches && valueValid;
    return {
      ...saved,
      ...(actual
        ? {
            id: actual.id,
            label: actual.label,
            kind: actual.kind,
            options: actual.options,
            required: actual.required,
          }
        : {}),
      value,
      source: validSource(saved.source) ? saved.source : undefined,
      candidate: valid ? saved.candidate : undefined,
      conflict: valid ? saved.conflict : undefined,
      approval: valid && approvalValid ? saved.approval : undefined,
      state:
        valid && saved.state !== "confirmed"
          ? saved.state
          : valid && approvalValid
            ? "confirmed"
            : value
              ? "user_provided"
              : "unresolved",
      revision: valid ? saved.revision : saved.revision + 1,
    };
  };
  if (!targetMatches)
    return [
      ...project.fields
        .filter((f) => f.value)
        .map((f) =>
          merge({
            ...f,
            id: `manual:${f.id}`,
            kind: "text",
            options: undefined,
            approval: undefined,
            state: "user_provided",
          }),
        ),
      ...parsed,
    ];
  return [
    ...parsed.map((actual) => {
      const saved = project.fields.find((f) => f.id === actual.id);
      return saved ? merge(saved, actual) : actual;
    }),
    ...project.fields
      .filter((f) => f.id.startsWith("manual:"))
      .map((f) => merge({ ...f, kind: "text", options: undefined })),
  ];
}
