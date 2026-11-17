import { apiError, assistant, ownedSession } from "@/lib/orcha-server";
import { resolveVisitor, responseHeaders } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ sessionId: string }> };

async function loadAllHistory(sessionId: string) {
  const first = await assistant().history(sessionId, { page: 1, pageSize: 100 });
  const items = [...first.items];
  let page = 1;
  let hasMore = first.hasMore;
  while (hasMore && page < 10) {
    page += 1;
    const next = await assistant().history(sessionId, { page, pageSize: 100 });
    items.push(...next.items);
    hasMore = next.hasMore;
  }
  return { snapshot: first, items };
}

async function loadAllEvents(sessionId: string) {
  const first = await assistant().events(sessionId, { page: 1, pageSize: 100 });
  const events = [...first.events];
  let page = 1;
  let hasMore = first.hasMore;
  while (hasMore && page < 10) {
    page += 1;
    const next = await assistant().events(sessionId, {
      page,
      pageSize: 100,
      throughSequence: first.throughSequence,
    });
    events.push(...next.events);
    hasMore = next.hasMore;
  }
  return events;
}

export async function GET(request: Request, context: Context) {
  try {
    const { sessionId } = await context.params;
    const visitor = resolveVisitor(request);
    await ownedSession(request, sessionId, visitor.id);
    const [historyResult, events] = await Promise.all([
      loadAllHistory(sessionId),
      loadAllEvents(sessionId),
    ]);
    return Response.json(
      { ...historyResult.snapshot, history: historyResult.items, events },
      { headers: responseHeaders(visitor.cookie) },
    );
  } catch (error) {
    return apiError(error, "Session could not be loaded.");
  }
}
