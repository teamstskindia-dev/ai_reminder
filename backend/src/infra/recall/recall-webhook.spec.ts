import { randomBytes } from 'node:crypto';
import { decodeWebhookSecret, signWebhook, verifyRecallWebhook, WEBHOOK_TOLERANCE_SECONDS } from './recall-webhook';

const secret = `whsec_${randomBytes(24).toString('base64')}`;
const body = Buffer.from(JSON.stringify({ event: 'bot.done', data: { bot: { id: 'x' } } }));
const now = 1_790_000_000;

function headers(overrides: Record<string, string | undefined> = {}) {
  return {
    'webhook-id': 'msg_2abc',
    'webhook-timestamp': String(now),
    'webhook-signature': signWebhook(secret, 'msg_2abc', now, body),
    ...overrides,
  };
}

describe('verifyRecallWebhook', () => {
  it('accepts a correctly signed delivery', () => {
    expect(verifyRecallWebhook(headers(), body, secret, now)).toEqual({ ok: true, webhookId: 'msg_2abc' });
  });

  it('accepts legacy svix-* header names', () => {
    const h = headers();
    const legacy = {
      'svix-id': h['webhook-id'],
      'svix-timestamp': h['webhook-timestamp'],
      'svix-signature': h['webhook-signature'],
    };
    expect(verifyRecallWebhook(legacy, body, secret, now).ok).toBe(true);
  });

  it('accepts any matching v1 entry (secret rotation sends several)', () => {
    const other = `whsec_${randomBytes(24).toString('base64')}`;
    const sig = `${signWebhook(other, 'msg_2abc', now, body)} v2,ignored ${signWebhook(secret, 'msg_2abc', now, body)}`;
    expect(verifyRecallWebhook(headers({ 'webhook-signature': sig }), body, secret, now).ok).toBe(true);
  });

  it('rejects a tampered body', () => {
    const tampered = Buffer.from(body.toString().replace('bot.done', 'bot.fatal'));
    expect(verifyRecallWebhook(headers(), tampered, secret, now)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a signature made with another secret', () => {
    const other = `whsec_${randomBytes(24).toString('base64')}`;
    const sig = signWebhook(other, 'msg_2abc', now, body);
    expect(verifyRecallWebhook(headers({ 'webhook-signature': sig }), body, secret, now)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects a replayed id (signature bound to the id)', () => {
    expect(verifyRecallWebhook(headers({ 'webhook-id': 'msg_other' }), body, secret, now).ok).toBe(false);
  });

  it('rejects stale or future timestamps', () => {
    const late = now + WEBHOOK_TOLERANCE_SECONDS + 1;
    expect(verifyRecallWebhook(headers(), body, secret, late)).toEqual({ ok: false, reason: 'bad_timestamp' });
    const early = now - WEBHOOK_TOLERANCE_SECONDS - 1;
    expect(verifyRecallWebhook(headers(), body, secret, early)).toEqual({ ok: false, reason: 'bad_timestamp' });
    expect(verifyRecallWebhook(headers({ 'webhook-timestamp': '12abc' }), body, secret, now).ok).toBe(false);
  });

  it('rejects missing headers and non-v1 signatures', () => {
    expect(verifyRecallWebhook(headers({ 'webhook-id': undefined }), body, secret, now)).toEqual({
      ok: false,
      reason: 'missing_headers',
    });
    const sig = signWebhook(secret, 'msg_2abc', now, body).replace('v1,', 'v2,');
    expect(verifyRecallWebhook(headers({ 'webhook-signature': sig }), body, secret, now).ok).toBe(false);
  });

  it('rejects a malformed secret', () => {
    expect(verifyRecallWebhook(headers(), body, 'not-a-secret', now)).toEqual({ ok: false, reason: 'bad_secret' });
    expect(decodeWebhookSecret('whsec_')).toBeNull();
  });
});
