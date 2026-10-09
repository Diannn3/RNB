import { create } from "zustand";
import type { ConversationMessage, InterviewQuestion } from "./domain";
export type Stage = "upload" | "conversation" | "verification" | "export";
interface Journey {
  messages: ConversationMessage[];
  skipped: string[];
  composer: string;
  running: boolean;
  setRunning: (running: boolean) => void;
  question?: InterviewQuestion;
  setQuestion: (question?: InterviewQuestion) => void;
  append: (message: ConversationMessage) => void;
  skip: (id: string) => void;
  setComposer: (text: string) => void;
  reset: () => void;
  restore: (messages: ConversationMessage[], skipped: string[], question?: InterviewQuestion) => void;
}
export const useJourney = create<Journey>((set) => ({
  messages: [], skipped: [], composer: "", running: false,
  setRunning: (running) => set({ running }),
  setQuestion: (question) => set({ question }),
  append: (message) => set((s) => ({ messages: s.messages.some((m) => m.id === message.id) ? s.messages : [...s.messages, message].slice(-500) })),
  skip: (id) => set((s) => ({ skipped: [...new Set([...s.skipped, id])] })),
  setComposer: (composer) => set({ composer }),
  reset: () => set({ messages: [], skipped: [], composer: "", running: false, question: undefined }),
  restore: (messages, skipped, question) => set({ messages, skipped, composer: "", running: false, question }),
}));
