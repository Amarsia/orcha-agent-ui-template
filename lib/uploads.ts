import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { appConfig } from "@/config/app";

const UPLOADS_ROOT = path.resolve(process.cwd(), ".orcha", "uploads");
const FILE_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

const EXT_TO_MIME: Record<string, string> = {
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webp": "image/webp",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const MIME_TO_EXT = Object.fromEntries(
  Object.entries(EXT_TO_MIME).map(([extension, mimeType]) => [mimeType, extension]),
);

export type StoredUpload = {
  id: string;
  visitorId: string;
  name: string;
  mimeType: string;
  fileName: string;
  size: number;
};

export class UploadError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function visitorDirectory(visitorId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(visitorId)) {
    throw new UploadError("Invalid visitor session.");
  }
  return path.join(UPLOADS_ROOT, visitorId);
}

function sanitizeName(name: string) {
  return path.basename(name || "attachment").replace(/[\r\n\0]/g, "").slice(0, 180);
}

function resolveFileType(file: File) {
  const extension = path.extname(file.name).toLowerCase();
  const declaredMime = file.type.trim().toLowerCase().split(";")[0];
  if (extension && EXT_TO_MIME[extension]) {
    return { extension, mimeType: EXT_TO_MIME[extension] };
  }
  if (declaredMime && MIME_TO_EXT[declaredMime]) {
    return { extension: MIME_TO_EXT[declaredMime], mimeType: declaredMime };
  }
  throw new UploadError(
    `Unsupported file type. Use images, PDF, TXT, Markdown, CSV, JSON, Word, or Excel files.`,
  );
}

export async function saveVisitorUpload(visitorId: string, file: File): Promise<StoredUpload> {
  if (!appConfig.allowFileUploads) throw new UploadError("File uploads are disabled.", 403);
  if (file.size <= 0) throw new UploadError("Cannot upload an empty file.");
  if (file.size > appConfig.maxFileSizeMb * 1024 * 1024) {
    throw new UploadError(`Files must be ${appConfig.maxFileSizeMb} MB or smaller.`);
  }

  const { extension, mimeType } = resolveFileType(file);
  const id = randomUUID().replaceAll("-", "");
  const originalName = sanitizeName(file.name);
  const fileName = `${id}-${originalName || `attachment${extension}`}`;
  const directory = visitorDirectory(visitorId);
  const bytes = Buffer.from(await file.arrayBuffer());
  const metadata: StoredUpload = {
    id,
    visitorId,
    name: originalName,
    mimeType,
    fileName,
    size: bytes.byteLength,
  };

  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, fileName), bytes),
    writeFile(path.join(directory, `${id}.meta.json`), JSON.stringify(metadata), "utf8"),
  ]);
  return metadata;
}

export async function resolveVisitorUpload(visitorId: string, fileId: string) {
  if (!FILE_ID_PATTERN.test(fileId)) throw new UploadError("Invalid attachment ID.");
  const directory = visitorDirectory(visitorId);
  let metadata: StoredUpload;
  try {
    metadata = JSON.parse(
      await readFile(path.join(directory, `${fileId}.meta.json`), "utf8"),
    ) as StoredUpload;
  } catch {
    throw new UploadError("Attachment not found.", 404);
  }
  if (metadata.visitorId !== visitorId) throw new UploadError("Attachment not found.", 404);

  const filePath = path.join(directory, path.basename(metadata.fileName));
  try {
    await stat(filePath);
  } catch {
    throw new UploadError("Attachment file is missing.", 404);
  }
  return { metadata, filePath };
}
