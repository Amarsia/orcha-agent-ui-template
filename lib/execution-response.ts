import type { Execution } from "orchajs";
import { responseHeaders } from "@/lib/visitor";

const encoder = new TextEncoder();

export function executionResponse(execution: Execution, cookie?: string) {
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (value: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      };
      write({ type: "session", sessionId: execution.sessionId });
      void (async () => {
        try {
          for await (const snapshot of execution.stream) write({ type: "snapshot", snapshot });
          write({ type: "result", result: await execution.result });
        } catch (error) {
          write({ type: "error", error: error instanceof Error ? error.message : "Execution failed." });
        } finally {
          if (!closed) controller.close();
        }
      })();
    },
    cancel() {
      closed = true;
    },
  });
  const headers = responseHeaders(cookie);
  headers.set("Content-Type", "application/x-ndjson; charset=utf-8");
  return new Response(stream, { headers });
}
