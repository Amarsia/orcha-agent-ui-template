import "server-only";

import type { AgentRuntime, SessionSnapshot } from "orchajs";
import { orcha } from "@/orcha";

export class ConfigurationError extends Error {}

export function hasProviderConfig(): boolean {
  return Boolean(
    process.env.AMARSIA_PROJECT_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      process.env.ANTHROPIC_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim() ||
      process.env.DEEPSEEK_API_KEY?.trim(),
  );
}

export function assistant(): AgentRuntime {
  if (!hasProviderConfig()) {
    throw new ConfigurationError(
      "Set AMARSIA_PROJECT_KEY (recommended) or a model provider API key in .env.",
    );
  }
  const agent = orcha.assistant as AgentRuntime | undefined;
  if (!agent) throw new ConfigurationError("The assistant agent is not registered.");
  return agent;
}

export function canAccessSession(session: SessionSnapshot, visitorId: string): boolean {
  return session.metadata.visitorId === visitorId;
}

export async function ownedSession(
  _request: Request,
  sessionId: string,
  visitorId: string,
): Promise<SessionSnapshot> {
  if (!/^ses_[a-zA-Z0-9_-]+$/.test(sessionId)) throw new Error("Session not found.");
  const session = await assistant().get(sessionId);
  if (!canAccessSession(session, visitorId)) throw new Error("Session not found.");
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
