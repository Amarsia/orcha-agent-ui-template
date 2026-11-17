import { readFile } from "node:fs/promises";
import { resolveVisitorUpload, UploadError } from "@/lib/uploads";
import { resolveVisitor, responseHeaders } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ fileId: string }> };

export async function GET(request: Request, context: Context) {
  const visitor = resolveVisitor(request);
  try {
    const { fileId } = await context.params;
    const { metadata, filePath } = await resolveVisitorUpload(visitor.id, fileId);
    const bytes = await readFile(filePath);
    const headers = responseHeaders(visitor.cookie);
    headers.set("Content-Type", metadata.mimeType);
    headers.set("Content-Length", String(bytes.byteLength));
    headers.set("Cache-Control", "private, max-age=3600");
    return new Response(bytes, { status: 200, headers });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "File could not be loaded." },
      {
        status: error instanceof UploadError ? error.status : 500,
        headers: responseHeaders(visitor.cookie),
      },
    );
  }
}
