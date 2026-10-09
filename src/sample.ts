import type { PaperworkAgentAdapter, SemanticField, InterviewTurnInput, InterviewTurnResult } from "./domain";
export async function sampleTurn(input: InterviewTurnInput, signal: AbortSignal): Promise<InterviewTurnResult> {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const text = input.text.toLowerCase();
  const address = /address|residen|live/.test(text);
  const name = /name|who/.test(text);
  const source = address ? { documentId: "sample-letter", page: 1, quote: "Present address: 42 Mabini Street, Los Banos" } : name ? { documentId: "sample-record", page: 1, quote: "Full name: Alex Reyes" } : undefined;
  return { documentHash: input.target.hash, analysisRevision: input.analysisRevision, message: {
    id: crypto.randomUUID(), role: "assistant",
    text: address ? "The fictional student record lists a permanent address, while the residence letter lists the present address. Both can be true. This form asks where you live now; choose the record that applies before reviewing the answer." : name ? "The fictional student record names Alex Reyes. Check that this is the person completing the application before approving it." : "This is a deterministic sample, not a live model. I can explain the sample's name or address evidence. The email is missing from these records and must be supplied by you.",
    sources: source && input.supporting.some((d) => d.id === source.documentId) ? [source] : undefined,
  } };
}
export const sampleAdapter: PaperworkAgentAdapter = {
  capabilities: { analysis: true, model: "sample", route: "sample" },
  async analyze({ target, supporting }, signal) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 700);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Cancelled", "AbortError"));
        },
        { once: true },
      );
    });
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const record = supporting.find((d) => d.id === "sample-record");
    const letter = supporting.find((d) => d.id === "sample-letter");
    const nameSource = record
      ? { documentId: record.id, page: 1, quote: "Full name: Alex Reyes" }
      : undefined;
    const permanent = record
      ? {
          documentId: record.id,
          page: 1,
          quote: "Permanent address: 18 Acacia Street, Los Banos",
        }
      : undefined;
    const present = letter
      ? {
          documentId: letter.id,
          page: 1,
          quote: "Present address: 42 Mabini Street, Los Banos",
        }
      : undefined;
    const fields: SemanticField[] = [
      {
        id: "full_name",
        label: "Full name",
        kind: "text",
        required: true,
        value: record ? "Alex Reyes" : "",
        state: record ? "candidate" : "unresolved",
        revision: 1,
        source: nameSource,
        candidate: record
          ? { value: "Alex Reyes", source: nameSource }
          : undefined,
      },
      {
        id: "present_address",
        label: "Present address",
        kind: "text",
        required: true,
        value: "",
        state: record && letter ? "conflict" : "unresolved",
        revision: 1,
        question: "Which address describes where you live now?",
        conflict:
          record && letter
            ? {
                explanation:
                  "These records describe different address types. They are not necessarily contradictory. The form asks for your present address.",
                alternatives: [
                  { value: "18 Acacia Street, Los Banos", source: permanent },
                  { value: "42 Mabini Street, Los Banos", source: present },
                ],
              }
            : undefined,
      },
      {
        id: "email",
        label: "Email address",
        kind: "text",
        required: true,
        value: "",
        state: "unresolved",
        revision: 1,
        question:
          "What email address would you like to use for this application?",
      },
      {
        id: "preferred_contact",
        label: "Preferred contact",
        kind: "text",
        required: false,
        value: record ? "Email" : "",
        state: record ? "candidate" : "unresolved",
        revision: 1,
        source: record
          ? {
              documentId: record.id,
              page: 1,
              quote: "Preferred contact: Email",
            }
          : undefined,
      },
    ];
    return { documentHash: target.hash, analysisRevision: "sample-v1", fields };
  },
};
