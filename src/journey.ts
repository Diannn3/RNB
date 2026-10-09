import { create } from "zustand";
import type { ConversationMessage, InterviewQuestion } from "./domain";
import type { InterviewProgress } from "./interview";
export type Stage = "upload" | "conversation" | "verification" | "export";
interface Journey {
  messages: ConversationMessage[];
  skipped: string[];
  composer: string;
  running: boolean;
  progress: InterviewProgress;
  record: (id: string, revision: number, status: "answered" | "explicit_blank") => void;
  bindLastAnswer: (fieldId: string, revision: number) => void;
  reopen: (ids: string[]) => void;
  setRunning: (running: boolean) => void;
  question?: InterviewQuestion;
  setQuestion: (question?: InterviewQuestion) => void;
  append: (message: ConversationMessage) => void;
  skip: (id: string) => void;
  setComposer: (text: string) => void;
  reset: () => void;
  restore: (messages: ConversationMessage[], skipped: string[], question?: InterviewQuestion, progress?: InterviewProgress) => void;
}
export const useJourney = create<Journey>((set) => ({
  messages: [], skipped: [], composer: "", running: false,
  progress: {},
  bindLastAnswer: (fieldId, fieldRevision) => set((s) => { const lastId = [...s.messages].reverse().find((m) => m.role === "user")?.id; return { messages: s.messages.map((m) => m.id === lastId ? { ...m, fieldId, fieldRevision, purpose: "answer" as const } : m) }; }),
  record: (id, revision, status) => set((s) => ({ progress: { ...s.progress, [id]: { revision, status } } })),
  reopen: (ids) => set((s) => ({ progress: Object.fromEntries(Object.entries(s.progress).filter(([id]) => !ids.includes(id))) })),
  setRunning: (running) => set({ running }),
  setQuestion: (question) => set({ question }),
  append: (message) => set((s) => ({ messages: s.messages.some((m) => m.id === message.id) ? s.messages : [...s.messages, message].slice(-500) })),
  skip: (id) => set((s) => ({ skipped: [...new Set([...s.skipped, id])] })),
  setComposer: (composer) => set({ composer }),
  reset: () => set({ messages: [], skipped: [], composer: "", running: false, question: undefined, progress: {} }),
  restore: (messages, skipped, question, progress = {}) => set({ messages, skipped, composer: "", running: false, question, progress }),
}));
