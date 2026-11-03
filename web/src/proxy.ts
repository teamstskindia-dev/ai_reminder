import { NextResponse, type NextRequest } from "next/server";

/**
 * Route protection (Next 16 `proxy`, formerly middleware).
 * - App routes require the API's refresh cookie; otherwise → /login?next=<path>.
 * - /login with a session → /dashboard.
 * The cookie is only a hint: the API remains the source of truth and the client redirects to
 * /login if refreshing the session fails.
 */

const REFRESH_COOKIE = "remi_rt";

const APP_PREFIXES = [
  "/dashboard",
  "/analytics",
  "/calendar",
  "/action-items",
  "/reminders",
  "/ask",
  "/notifications",
  "/settings",
];

const isAppRoute = (pathname: string) =>
  APP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(REFRESH_COOKIE)?.value);

  if (isAppRoute(pathname) && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && hasSession && !request.nextUrl.searchParams.has("reauth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/analytics/:path*",
    "/calendar/:path*",
    "/action-items/:path*",
    "/reminders/:path*",
    "/ask/:path*",
    "/notifications/:path*",
    "/settings/:path*",
  ],
};
