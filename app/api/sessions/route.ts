import { apiError, assistant, canAccessSession } from "@/lib/orcha-server";
import { resolveVisitor, responseHeaders } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const visitor = resolveVisitor(request);
    const sessions = await assistant().list({ page: 1, pageSize: 100 });
    const items = sessions.items.filter((session) => canAccessSession(session, visitor.id));
    return Response.json(
      { ...sessions, items },
      { headers: responseHeaders(visitor.cookie) },
    );
  } catch (error) {
    return apiError(error, "Sessions could not be loaded.");
  }
}
