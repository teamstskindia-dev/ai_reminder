import { NextResponse, type NextRequest } from 'next/server';

/** Admin refresh cookie set (httpOnly) by the API. Its presence is the cheap "signed in" signal. */
const REFRESH_COOKIE = 'remi_admin_rt';

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === '/login' || pathname.startsWith('/login/')) {
    return NextResponse.next();
  }
  if (request.cookies.has(REFRESH_COOKIE)) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  if (pathname !== '/') {
    url.searchParams.set('next', `${pathname}${search}`);
  }
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|txt|xml)$).*)',
  ],
};
