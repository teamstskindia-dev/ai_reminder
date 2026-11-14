import { generateKeyPairSync, sign } from 'node:crypto';
import { AppConfig } from '../../config/app-config';
import { SettingsService } from '../content/settings.service';
import { UsersRepository } from '../users/users.repository';
import { APPLE_ISSUER, AppleAuthService, type AppleJwk } from './apple-auth.service';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: 'jwk' }) as object), kid: 'test-kid', alg: 'RS256' } as AppleJwk;

function token(payload: Record<string, unknown>, kid = 'test-kid'): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: 'RS256', kid });
  const body = enc(payload);
  const sig = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}

class TestAppleAuth extends AppleAuthService {
  protected override fetchKeys(): Promise<AppleJwk[]> {
    return Promise.resolve([jwk]);
  }
}

const now = () => Math.floor(Date.now() / 1000);
const valid = (extra: Record<string, unknown> = {}) => ({
  iss: APPLE_ISSUER,
  aud: 'com.remi.app',
  exp: now() + 600,
  sub: 'apple-user-1',
  email: 'Asha@Example.com',
  email_verified: 'true',
  ...extra,
});

describe('AppleAuthService.verifyIdentityToken', () => {
  const config = { apple: { clientIds: ['com.remi.app'] } } as unknown as AppConfig;
  const service = new TestAppleAuth(config, {} as SettingsService, {} as UsersRepository);

  it('accepts a valid token', async () => {
    await expect(service.verifyIdentityToken(token(valid()))).resolves.toEqual({
      sub: 'apple-user-1',
      email: 'asha@example.com',
      emailVerified: true,
    });
  });

  it.each([
    ['wrong audience', valid({ aud: 'com.other.app' })],
    ['wrong issuer', valid({ iss: 'https://evil.example' })],
    ['expired', valid({ exp: now() - 3600 })],
    ['missing sub', valid({ sub: '' })],
  ])('rejects a token with %s', async (_label, payload) => {
    await expect(service.verifyIdentityToken(token(payload))).rejects.toThrow();
  });

  it('rejects a tampered token', async () => {
    const [h, , s] = token(valid()).split('.');
    const forged = Buffer.from(JSON.stringify(valid({ sub: 'someone-else' }))).toString('base64url');
    await expect(service.verifyIdentityToken(`${h}.${forged}.${s}`)).rejects.toThrow();
  });

  it('rejects an unknown signing key', async () => {
    await expect(service.verifyIdentityToken(token(valid(), 'other-kid'))).rejects.toThrow();
  });
});
