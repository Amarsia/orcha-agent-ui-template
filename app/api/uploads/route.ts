import { saveVisitorUpload, UploadError } from "@/lib/uploads";
import { resolveVisitor, responseHeaders } from "@/lib/visitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const visitor = resolveVisitor(request);
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json(
        { error: "No file provided." },
        { status: 400, headers: responseHeaders(visitor.cookie) },
      );
    }
    const upload = await saveVisitorUpload(visitor.id, file);
    return Response.json(
      {
        id: upload.id,
        name: upload.name,
        mimeType: upload.mimeType,
        size: upload.size,
      },
      { headers: responseHeaders(visitor.cookie) },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "File upload failed." },
      {
        status: error instanceof UploadError ? error.status : 500,
        headers: responseHeaders(visitor.cookie),
      },
    );
  }
}
