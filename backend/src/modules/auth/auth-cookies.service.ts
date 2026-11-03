import { Injectable } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AppConfig } from '../../config/app-config';
import type { AuthTokens } from '../../common/types/api.types';

export const COOKIES = {
  userAccess: 'remi_at',
  userRefresh: 'remi_rt',
  adminAccess: 'remi_admin_at',
  adminRefresh: 'remi_admin_rt',
} as const;

type Kind = 'user' | 'admin';

/** Sets/clears the httpOnly auth cookies described in API contract §0. */
@Injectable()
export class AuthCookiesService {
  constructor(private readonly config: AppConfig) {}

  private base(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.cookie.secure,
      path: '/',
      domain: this.config.cookie.domain,
    };
  }

  private names(kind: Kind) {
    return kind === 'user'
      ? { access: COOKIES.userAccess, refresh: COOKIES.userRefresh }
      : { access: COOKIES.adminAccess, refresh: COOKIES.adminRefresh };
  }

  set(res: Response, kind: Kind, tokens: AuthTokens): void {
    const n = this.names(kind);
    res.cookie(n.access, tokens.accessToken, { ...this.base(), maxAge: tokens.expiresIn * 1000 });
    res.cookie(n.refresh, tokens.refreshToken, {
      ...this.base(),
      maxAge: this.config.jwt.refreshTtlDays * 86_400_000,
    });
  }

  clear(res: Response, kind: Kind): void {
    const n = this.names(kind);
    res.clearCookie(n.access, this.base());
    res.clearCookie(n.refresh, this.base());
  }

  readRefresh(req: Request, kind: Kind): string | undefined {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[this.names(kind).refresh];
  }
}

/** Access token from `Authorization: Bearer` first, then the cookie. */
export function extractAccessToken(
  headers: Record<string, string | string[] | undefined>,
  cookies: Record<string, string | undefined> | undefined,
  cookieName: string,
): string | null {
  const auth = headers.authorization;
  const header = Array.isArray(auth) ? auth[0] : auth;
  if (header) {
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && value) return value.trim();
  }
  return cookies?.[cookieName] ?? null;
}

/** Minimal cookie header parser (Socket.IO handshakes don't go through cookie-parser). */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}
