import type { DocumentRef, SemanticField } from "./domain";
export interface FieldDisposition { revision: number; status: "answered" | "explicit_blank" }
export type InterviewProgress = Record<string, FieldDisposition>;
export function validAnswer(field: SemanticField, value: string) {
  if (!value.trim() || value.length > 20000 || field.kind === "unsupported") return false;
  if (field.kind === "checkbox") return ["Yes", "No"].includes(value);
  if (field.kind === "radio" || field.kind === "dropdown") return !!field.options?.includes(value);
  return true;
}
export function handled(field: SemanticField, progress: InterviewProgress) {
  const entry = progress[field.id];
  return entry?.revision === field.revision && (entry.status === "answered" ? validAnswer(field, field.value) && field.state !== "conflict" : !field.required && !field.value);
}
export function pendingFields(fields: SemanticField[], progress: InterviewProgress) {
  return fields.filter((f) => f.kind !== "unsupported" && !handled(f, progress));
}
export function interviewComplete(fields: SemanticField[], progress: InterviewProgress) {
  return fields.some((f) => f.kind !== "unsupported") && !pendingFields(fields, progress).length;
}
export function confirmationKey(documents: DocumentRef[], fields: SemanticField[], progress: InterviewProgress) {
  return JSON.stringify([documents.map((d) => [d.id, d.hash]), fields.map((f) => [f.id, f.revision, f.value, f.required, f.kind, f.state === "conflict"]), progress]);
}
