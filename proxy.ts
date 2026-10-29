import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "__Host-orcha_agent_visitor";
const DEVELOPMENT_COOKIE_NAME = "orcha_agent_visitor";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function proxy(request: NextRequest) {
  const secure = process.env.NODE_ENV === "production";
  const name = secure ? COOKIE_NAME : DEVELOPMENT_COOKIE_NAME;
  if (request.cookies.has(name)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set(name, crypto.randomUUID(), {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
