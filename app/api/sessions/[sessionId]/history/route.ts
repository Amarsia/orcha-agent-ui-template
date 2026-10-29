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
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const result = await assistant().history(sessionId, { page, pageSize: 100 });
    return Response.json(result, { headers: responseHeaders(visitor.cookie) });
  } catch (error) {
    return apiError(error, "History could not be loaded.");
  }
}
