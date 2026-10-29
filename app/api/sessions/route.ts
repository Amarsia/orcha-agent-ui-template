import { apiError, assistant } from "@/lib/orcha-server";
import { resolveVisitor, responseHeaders } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const visitor = resolveVisitor(request);
    const sessions = await assistant().list({
      page: 1,
      pageSize: 100,
      metadata: { visitorId: visitor.id },
    });
    return Response.json(sessions, { headers: responseHeaders(visitor.cookie) });
  } catch (error) {
    return apiError(error, "Sessions could not be loaded.");
  }
}
