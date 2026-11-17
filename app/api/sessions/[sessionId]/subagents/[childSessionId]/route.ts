import { apiError, assistant, ownedSession } from "@/lib/orcha-server";
import { resolveVisitor, responseHeaders } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ sessionId: string; childSessionId: string }> };

async function loadAllSubagentEvents(childSessionId: string) {
  const first = await assistant().subagentEvents(childSessionId, { page: 1, pageSize: 100 });
  const events = [...first.events];
  let page = 1;
  let hasMore = first.hasMore;
  while (hasMore && page < 10) {
    page += 1;
    const next = await assistant().subagentEvents(childSessionId, {
      page,
      pageSize: 100,
      throughSequence: first.throughSequence,
    });
    events.push(...next.events);
    hasMore = next.hasMore;
  }
  return { first, events };
}

export async function GET(request: Request, context: Context) {
  try {
    const { sessionId, childSessionId } = await context.params;
    const visitor = resolveVisitor(request);
    await ownedSession(request, sessionId, visitor.id);

    const { first, events } = await loadAllSubagentEvents(childSessionId);
    const created = events.find((event) => event.type === "session.created");
    const lineage = (created?.data as { lineage?: { parentSessionId?: string } } | undefined)
      ?.lineage;
    if (lineage?.parentSessionId && lineage.parentSessionId !== sessionId) {
      return Response.json(
        { error: "Subagent session does not belong to this parent session." },
        { status: 403, headers: responseHeaders(visitor.cookie) },
      );
    }

    const terminalRun = [...events]
      .reverse()
      .find((event) =>
        event.type === "run.completed" ||
        event.type === "run.failed" ||
        event.type === "run.paused",
      );
    const derivedStatus =
      terminalRun?.type === "run.completed"
        ? "completed"
        : terminalRun?.type === "run.failed"
          ? "failed"
          : terminalRun?.type === "run.paused"
            ? String((terminalRun.data as { status?: string } | undefined)?.status ?? "paused")
            : events.length > 0
              ? "running"
              : first.status;

    return Response.json(
      {
        sessionId: childSessionId,
        agent: first.agent,
        status: derivedStatus,
        events,
      },
      { headers: responseHeaders(visitor.cookie) },
    );
  } catch (error) {
    return apiError(error, "Subagent session could not be loaded.");
  }
}
