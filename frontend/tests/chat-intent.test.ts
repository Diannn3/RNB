import { expect, it } from "vitest";
import { chatIntent, isFieldHelp } from "../src/chat-intent";

it("keeps help requests out of the answer path", () => {
  for (const text of ["explain", "Explain this field", "What should I put here?", "what does this mean?", "Please help me", "Can you explain this question?"]) {
    expect(chatIntent(text)).toBe("explain");
    expect(isFieldHelp(text)).toBe(true);
  }
});
it("preserves named service/form requests and ordinary field values", () => {
  for (const text of ["Explain SSS", "Explain this form", "What is PMRF?"]) {
    expect(chatIntent(text)).toBe("explain");
    expect(isFieldHelp(text)).toBe(false);
  }
  for (const text of ["Research Assistant", "Alex Reyes", "alex@example.com", "January–December 2025", "No"]) expect(chatIntent(text)).toBe("answer");
  expect(chatIntent("Compare my documents")).toBe("compare");
});
