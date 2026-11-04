import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { registerDecorator, ValidationOptions } from 'class-validator';
import { z } from 'zod';

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
export const FONT_FAMILY_RE = /^[A-Za-z0-9 -]{1,64}$/;
/**
 * The only meeting URLs the bot will open: https://meet.google.com/abc-defg-hij, also in the newer
 * https://meet.google.com/meet/abc-defg-hij form (instant-meeting links, and where Meet redirects classic links),
 * with an optional trailing slash and query string. Group 1 is the meeting code.
 */
export const MEET_URL_STRICT_RE =
  /^https:\/\/meet\.google\.com\/(?:meet\/)?([a-z]{3}-[a-z]{4}-[a-z]{3})\/?(?:\?[^#\s]*)?$/;
/** expo-router tab names used as `href` for `mobile_tab` navigation items. */
export const MOBILE_ROUTE_RE = /^[a-z][a-z0-9-]{0,40}$/;

export interface SafeUrlOptions {
  /** `/path` (never `//host`). Default true. */
  relative?: boolean;
  /** `mailto:` links. Default true. */
  mailto?: boolean;
  /** `remi://` deep links. Default true. */
  appScheme?: boolean;
}

// eslint-disable-next-line no-control-regex
const CONTROL_OR_SPACE = /[\u0000- \u007f-\u009f]/;

/**
 * URLs accepted from admins/users: `https:` (absolute), a relative path starting with a single `/`,
 * `mailto:` or `remi://`. Everything else (`javascript:`, `data:`, `http:`, `//host`, ...) is rejected.
 */
export function isSafeUrl(value: unknown, opts: SafeUrlOptions = {}): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v || v.length > 2048 || CONTROL_OR_SPACE.test(v)) return false;
  const { relative = true, mailto = true, appScheme = true } = opts;
  if (v.startsWith('/')) return relative && !v.startsWith('//') && !v.startsWith('/\\');
  const lower = v.toLowerCase();
  if (lower.startsWith('mailto:')) return mailto && /^mailto:[^\s@/]+@[^\s@/]+\.[^\s@/]+(\?.*)?$/i.test(v);
  if (lower.startsWith('remi://')) return appScheme && /^remi:\/\/[A-Za-z0-9\-._~/?#=&%+]*$/.test(v);
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Canonical `https://meet.google.com/abc-defg-hij` for any accepted Meet link (query dropped), else null. */
export function normalizeMeetUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 300) return null;
  const match = MEET_URL_STRICT_RE.exec(value);
  return match ? `https://meet.google.com/${match[1]}` : null;
}

export function isJoinableMeetUrl(value: unknown): value is string {
  return normalizeMeetUrl(value) !== null;
}

// ---- zod helpers (settings + section content) ----
export const zSafeUrl = (opts?: SafeUrlOptions) =>
  z
    .string()
    .trim()
    .max(2048)
    .refine((v) => isSafeUrl(v, opts), {
      message: 'must be an https:// URL, a relative /path, mailto: or remi:// link',
    });
export const zHttpsUrl = () => zSafeUrl({ relative: false, mailto: false, appScheme: false });
export const zHexColor = () => z.string().regex(HEX_COLOR_RE, 'must be a hex colour like #5B4FE9');
export const zFontFamily = () =>
  z.string().regex(FONT_FAMILY_RE, 'must contain only letters, digits, spaces and hyphens');

/** Human list of the URL forms `opts` accepts, e.g. "an https:// URL or a relative /path". */
export function describeSafeUrl(opts: SafeUrlOptions = {}): string {
  const { relative = true, mailto = true, appScheme = true } = opts;
  const forms = [
    'an https:// URL',
    ...(relative ? ['a relative /path'] : []),
    ...(mailto ? ['a mailto: link'] : []),
    ...(appScheme ? ['a remi:// link'] : []),
  ];
  return forms.length === 1 ? forms[0] : `${forms.slice(0, -1).join(', ')} or ${forms[forms.length - 1]}`;
}

// ---- class-validator decorators (DTOs); each also documents itself for OpenAPI ----
export function IsSafeUrl(opts?: SafeUrlOptions, validationOptions?: ValidationOptions) {
  const accepted = describeSafeUrl(opts);
  return applyDecorators(
    ApiProperty({ type: String, maxLength: 2048, description: `Must be ${accepted}.` }),
    (object: object, propertyName: string | symbol) =>
      registerDecorator({
        name: 'isSafeUrl',
        target: object.constructor,
        propertyName: String(propertyName),
        options: { message: `${String(propertyName)} must be ${accepted}`, ...validationOptions },
        validator: { validate: (value: unknown) => isSafeUrl(value, opts) },
      }),
  );
}

export function IsMeetUrl(validationOptions?: ValidationOptions) {
  return applyDecorators(
    ApiProperty({ type: String, pattern: MEET_URL_STRICT_RE.source, maxLength: 300 }),
    (object: object, propertyName: string | symbol) =>
      registerDecorator({
        name: 'isMeetUrl',
        target: object.constructor,
        propertyName: String(propertyName),
        options: {
          message: `${String(propertyName)} must be a Google Meet link like https://meet.google.com/abc-defg-hij`,
          ...validationOptions,
        },
        validator: { validate: (value: unknown) => isJoinableMeetUrl(value) },
      }),
  );
}
