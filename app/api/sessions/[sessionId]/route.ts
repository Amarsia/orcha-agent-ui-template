import { apiError, assistant, ownedSession } from "@/lib/orcha-server";
import { resolveVisitor, responseHeaders } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ sessionId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { sessionId } = await context.params;
    const visitor = resolveVisitor(request);
    await ownedSession(request, sessionId, visitor.id);
    const [history, events] = await Promise.all([
      assistant().history(sessionId, { page: 1, pageSize: 250 }),
      assistant().events(sessionId, { page: 1, pageSize: 500 }),
    ]);
    return Response.json(
      { ...history, history: history.items, events: events.events },
      { headers: responseHeaders(visitor.cookie) },
    );
  } catch (error) {
    return apiError(error, "Session could not be loaded.");
  }
}
