import { expect, it } from "vitest";
import { chatIntent, isFieldHelp } from "../src/chat-intent";

it("keeps help requests out of the answer path", () => {
  for (const text of ["explain", "Explain this field", "What should I put here?", "what does this mean?", "Please help me", "Can you explain this question?", "Could you help me with this field?", "Help me understand this question"]) {
    expect(chatIntent(text)).toBe("explain");
    expect(isFieldHelp(text)).toBe(true);
  }
});
it("routes contracted questions without consuming the pending answer", () => {
  for (const text of ["whats the pantawid pamilyang pilipino program?", "what's the Pantawid program?", "What’s the Pantawid program?"]) {
    expect(chatIntent(text)).toBe("explain");
    expect(isFieldHelp(text)).toBe(false);
  }
});
it("preserves named service/form requests and ordinary field values", () => {
  for (const text of ["Explain SSS", "Could you explain SSS?", "Can you explain Position?", "Explain this form", "What is PMRF?"]) {
    expect(chatIntent(text)).toBe("explain");
    expect(isFieldHelp(text)).toBe(false);
  }
  for (const text of ["Research Assistant", "Alex Reyes", "alex@example.com", "January–December 2025", "No"]) expect(chatIntent(text)).toBe("answer");
  expect(chatIntent("Compare my documents")).toBe("compare");
});
