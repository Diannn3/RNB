/** Route requests for guidance separately from values supplied for a form. */
export function chatIntent(text: string): "compare" | "explain" | "answer" {
  if (/^(?:please\s+)?compare\b/i.test(text.trim())) return "compare";
  if (/^(?:(?:please\s+)?(?:(?:can|could) you\s+)?(?:explain|define|help)\b|what (?:is|are|does|should i|do i)\b|what's\b)/i.test(text.trim())) return "explain";
  return "answer";
}

export function isFieldHelp(text: string): boolean {
  return /^(?:please\s+)?(?:(?:can|could) you\s+)?(?:explain(?: (?:this|the)(?: field| question))?|help(?: me)?|what does (?:this|that|this field) mean|what (?:should|do) i (?:put|enter|write)(?: (?:here|in this field|for this field))?)[.!?]*$/i.test(text.trim());
}
