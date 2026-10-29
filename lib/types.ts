import type {
  ClientToolCall,
  RunResult,
  SessionEvent,
  SessionHistoryItem,
  SessionSnapshot,
  Usage,
} from "orchajs";

export type { ClientToolCall, RunResult, SessionEvent, SessionHistoryItem, SessionSnapshot, Usage };

export type StreamEnvelope =
  | { type: "session"; sessionId: string }
  | { type: "snapshot"; snapshot: unknown }
  | { type: "result"; result: RunResult }
  | { type: "error"; error: string };

export type SessionDetail = SessionSnapshot & {
  history: SessionHistoryItem[];
  events: SessionEvent[];
};

export function textContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((part) =>
      typeof part === "object" && part && "type" in part && part.type === "text" &&
      "text" in part && typeof part.text === "string"
        ? [part.text]
        : [],
    )
    .join("\n");
}
