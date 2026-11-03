import { createHash } from 'node:crypto';
import { safeEqual } from '../../common/utils/crypto.util';

/** RFC 7636: base64url(SHA-256) challenge, 43–128 chars. */
export const CODE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/;
/** RFC 7636 verifier alphabet, 43–128 chars. */
export const CODE_VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/** Constant-time check that base64url(sha256(verifier)) equals the stored challenge. */
export function verifyPkce(verifier: string | undefined | null, challenge: string): boolean {
  if (!verifier || !CODE_VERIFIER_RE.test(verifier) || !CODE_CHALLENGE_RE.test(challenge)) return false;
  return safeEqual(pkceChallenge(verifier), challenge);
}
