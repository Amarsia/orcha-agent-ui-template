import { randomUUID } from "node:crypto";

const COOKIE = "__Host-orcha_agent_visitor";
const FALLBACK_COOKIE = "orcha_agent_visitor";
const MAX_AGE = 60 * 60 * 24 * 365;
const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

function readCookie(header: string | null, name: string) {
  return header
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)
    ?.slice(1)
    .join("=");
}

export function resolveVisitor(request: Request) {
  const secure = process.env.NODE_ENV === "production";
  const name = secure ? COOKIE : FALLBACK_COOKIE;
  const raw = readCookie(request.headers.get("cookie"), name);
  const existing = raw ? decodeURIComponent(raw) : "";
  if (UUID.test(existing)) return { id: existing };
  const id = randomUUID();
  return {
    id,
    cookie: `${name}=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE}${secure ? "; Secure" : ""}`,
  };
}

export function responseHeaders(cookie?: string) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (cookie) headers.set("Set-Cookie", cookie);
  return headers;
}
