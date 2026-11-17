import type { AgentContentInput, MessageContentInput } from "orchajs";
import { appConfig } from "@/config/app";
import { executionResponse } from "@/lib/execution-response";
import { apiError, assistant, ownedSession } from "@/lib/orcha-server";
import { resolveVisitorUpload } from "@/lib/uploads";
import { resolveVisitor } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: unknown;
      sessionId?: unknown;
      attachments?: unknown;
    };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    const attachmentIds = Array.isArray(body.attachments)
      ? body.attachments.filter((value): value is string => typeof value === "string")
      : [];
    if ((!prompt && attachmentIds.length === 0) || prompt.length > 20_000) {
      return Response.json(
        { error: "Provide instructions or attach a file. Instructions may not exceed 20,000 characters." },
        { status: 400 },
      );
    }
    if (attachmentIds.length > appConfig.maxFilesPerRun) {
      return Response.json(
        { error: `Attach at most ${appConfig.maxFilesPerRun} files per run.` },
        { status: 400 },
      );
    }
    const visitor = resolveVisitor(request);
    const contentItems: MessageContentInput[] = [];
    let firstFileName = "";
    for (const attachmentId of attachmentIds) {
      const { metadata, filePath } = await resolveVisitorUpload(visitor.id, attachmentId);
      firstFileName ||= metadata.name;
      contentItems.push({ type: "file", filePath, mimeType: metadata.mimeType });
    }
    if (prompt) contentItems.push({ type: "text", text: prompt });
    const content: AgentContentInput =
      attachmentIds.length === 0 && prompt ? prompt : contentItems;

    const agent = assistant();
    if (sessionId) await ownedSession(request, sessionId, visitor.id);
    const execution = sessionId
      ? agent.resume(sessionId, { content, clientCapabilities: agent.clientTools })
      : agent.run({
          content,
          clientCapabilities: agent.clientTools,
          name:
            prompt.replace(/\s+/g, " ").slice(0, 64) ||
            firstFileName.slice(0, 64) ||
            appConfig.name,
          metadata: { visitorId: visitor.id },
        });
    return executionResponse(execution, visitor.cookie);
  } catch (error) {
    return apiError(error, "The execution could not be started.");
  }
}
