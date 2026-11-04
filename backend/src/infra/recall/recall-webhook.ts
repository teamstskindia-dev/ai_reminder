import { createHmac, timingSafeEqual } from 'node:crypto';

/** Deliveries older (or further in the future) than this are refused as replays. */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type HeaderBag = Record<string, string | string[] | undefined>;

export type WebhookVerification =
  | { ok: true; webhookId: string }
  | { ok: false; reason: 'missing_headers' | 'bad_timestamp' | 'bad_secret' | 'bad_signature' };

function header(headers: HeaderBag, name: string): string | undefined {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
}

/** `whsec_<base64>` → HMAC key bytes (null when the secret is malformed). */
export function decodeWebhookSecret(secret: string): Buffer | null {
  if (!secret.startsWith('whsec_')) return null;
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  return key.length >= 16 ? key : null;
}

/** Signature header value for a payload (used by tests and local tooling). */
export function signWebhook(secret: string, webhookId: string, timestamp: number, payload: Buffer | string): string {
  const key = decodeWebhookSecret(secret);
  if (!key) throw new Error('invalid webhook secret');
  const mac = createHmac('sha256', key).update(`${webhookId}.${timestamp}.`).update(payload).digest('base64');
  return `v1,${mac}`;
}

/**
 * Verifies a Recall.ai webhook (Standard Webhooks / Svix scheme):
 * HMAC-SHA256 over `${webhook-id}.${webhook-timestamp}.${rawBody}` with the base64-decoded `whsec_` secret,
 * compared in constant time against every `v1,<base64>` entry of `webhook-signature` (several during secret
 * rotation). Legacy `svix-*` header names are accepted too. The timestamp must be within ±5 minutes.
 */
export function verifyRecallWebhook(
  headers: HeaderBag,
  rawBody: Buffer,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): WebhookVerification {
  const id = header(headers, 'webhook-id') ?? header(headers, 'svix-id');
  const ts = header(headers, 'webhook-timestamp') ?? header(headers, 'svix-timestamp');
  const signatures = header(headers, 'webhook-signature') ?? header(headers, 'svix-signature');
  if (!id || !ts || !signatures || id.length > 200 || signatures.length > 2000) {
    return { ok: false, reason: 'missing_headers' };
  }
  if (!/^\d{1,12}$/.test(ts) || Math.abs(nowSeconds - Number(ts)) > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'bad_timestamp' };
  }
  const key = decodeWebhookSecret(secret);
  if (!key) return { ok: false, reason: 'bad_secret' };

  const expected = createHmac('sha256', key).update(`${id}.${ts}.`).update(rawBody).digest();
  for (const entry of signatures.split(' ')) {
    const [version, value] = entry.split(',', 2);
    if (version !== 'v1' || !value) continue;
    const candidate = Buffer.from(value, 'base64');
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return { ok: true, webhookId: id };
    }
  }
  return { ok: false, reason: 'bad_signature' };
}
