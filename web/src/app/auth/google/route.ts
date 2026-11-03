import { connection, NextResponse, type NextRequest } from "next/server";
import { API_BASE_URL, NEXT_COOKIE } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sanitizeNext } from "@/lib/safe-next";

/**
 * Starts Google sign-in: remembers a validated `?next=` (same-origin path only) in a short-lived cookie
 * and hands off to the API, which owns the OAuth exchange and redirects back to /auth/callback?code=…
 */
export async function GET(request: NextRequest) {
  await connection();
  const rawNext = request.nextUrl.searchParams.get("next");
  const next = sanitizeNext(rawNext);
  if (rawNext && !next) logger.warn("ignored unsafe post-login redirect", { route: "/auth/google" });

  const response = NextResponse.redirect(`${API_BASE_URL}/auth/google?platform=web`);
  response.headers.set("cache-control", "no-store");
  if (next) {
    response.cookies.set(NEXT_COOKIE, next, {
      path: "/",
      maxAge: 600,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
  } else {
    response.cookies.delete(NEXT_COOKIE);
  }
  return response;
}
