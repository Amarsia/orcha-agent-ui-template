import { executionResponse } from "@/lib/execution-response";
import { apiError, assistant, ownedSession } from "@/lib/orcha-server";
import { resolveVisitor } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ sessionId: string; callId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { sessionId, callId } = await context.params;
    const visitor = resolveVisitor(request);
    const session = await ownedSession(request, sessionId, visitor.id);
    const pending = session.pendingClientActions.find((item) => item.callId === callId);
    if (!pending) return Response.json({ error: "Pending action not found." }, { status: 404 });
    const body = (await request.json()) as { output?: unknown };
    if (!body || !("output" in body)) {
      return Response.json({ error: "Action output is required." }, { status: 400 });
    }
    const execution = assistant().resume(sessionId, {
      toolResults: [{ callId, output: body.output }],
    });
    return executionResponse(execution, visitor.cookie);
  } catch (error) {
    return apiError(error, "The action could not be resolved.");
  }
}
