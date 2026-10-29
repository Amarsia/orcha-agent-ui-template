import "server-only";

import type { AgentRuntime, SessionSnapshot } from "orchajs";
import { orcha } from "@/orcha";

export class ConfigurationError extends Error {}

export function assistant(): AgentRuntime {
  if (!process.env.OPENAI_API_KEY) {
    throw new ConfigurationError("OPENAI_API_KEY is not configured.");
  }
  const agent = orcha.assistant as AgentRuntime | undefined;
  if (!agent) throw new ConfigurationError("The assistant agent is not registered.");
  return agent;
}

export async function ownedSession(
  request: Request,
  sessionId: string,
  visitorId: string,
): Promise<SessionSnapshot> {
  if (!/^ses_[a-zA-Z0-9_-]+$/.test(sessionId)) throw new Error("Session not found.");
  const session = await assistant().get(sessionId);
  if (session.metadata.visitorId !== visitorId) throw new Error("Session not found.");
  return session;
}

export function apiError(error: unknown, fallback: string) {
  const configuration = error instanceof ConfigurationError;
  const missing = error instanceof Error && error.message === "Session not found.";
  return Response.json(
    { error: configuration || missing ? error.message : fallback },
    { status: configuration ? 503 : missing ? 404 : 500 },
  );
}
