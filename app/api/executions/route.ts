import { appConfig } from "@/config/app";
import { executionResponse } from "@/lib/execution-response";
import { apiError, assistant, ownedSession } from "@/lib/orcha-server";
import { resolveVisitor } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { prompt?: unknown; sessionId?: unknown };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    if (!prompt || prompt.length > 20_000) {
      return Response.json({ error: "Prompt must be between 1 and 20,000 characters." }, { status: 400 });
    }
    const visitor = resolveVisitor(request);
    const agent = assistant();
    if (sessionId) await ownedSession(request, sessionId, visitor.id);
    const execution = sessionId
      ? agent.resume(sessionId, { content: prompt, clientCapabilities: agent.clientTools })
      : agent.run({
          content: prompt,
          clientCapabilities: agent.clientTools,
          name: prompt.replace(/\s+/g, " ").slice(0, 64) || appConfig.name,
          metadata: { visitorId: visitor.id },
        });
    return executionResponse(execution, visitor.cookie);
  } catch (error) {
    return apiError(error, "The execution could not be started.");
  }
}
