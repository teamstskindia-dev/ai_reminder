import { CODE_CHALLENGE_RE, CODE_VERIFIER_RE, pkceChallenge, verifyPkce } from './pkce';

// RFC 7636 appendix B test vector.
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('pkceChallenge', () => {
  it('matches the RFC 7636 appendix B vector', () => {
    expect(pkceChallenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
  });

  it('produces an unpadded base64url challenge of 43 chars', () => {
    const c = pkceChallenge('a'.repeat(128));
    expect(c).toHaveLength(43);
    expect(c).toMatch(CODE_CHALLENGE_RE);
    expect(c).not.toMatch(/[+/=]/);
  });
});

describe('verifyPkce', () => {
  it('accepts the matching verifier', () => {
    expect(verifyPkce(RFC_VERIFIER, RFC_CHALLENGE)).toBe(true);
  });

  it('accepts verifiers at the length bounds and with the full unreserved alphabet', () => {
    for (const v of ['a'.repeat(43), 'Z'.repeat(128), `AZaz09-._~${'x'.repeat(40)}`]) {
      expect(v).toMatch(CODE_VERIFIER_RE);
      expect(verifyPkce(v, pkceChallenge(v))).toBe(true);
    }
  });

  it('rejects a wrong verifier', () => {
    expect(verifyPkce(`${RFC_VERIFIER.slice(0, -1)}Y`, RFC_CHALLENGE)).toBe(false);
    expect(verifyPkce('b'.repeat(43), RFC_CHALLENGE)).toBe(false);
  });

  it('rejects verifiers that are too short or too long', () => {
    const short = 'a'.repeat(42);
    const long = 'a'.repeat(129);
    expect(verifyPkce(short, pkceChallenge(short))).toBe(false);
    expect(verifyPkce(long, pkceChallenge(long))).toBe(false);
  });

  it('rejects verifiers outside the RFC alphabet', () => {
    for (const v of [
      `${'a'.repeat(42)}+`,
      `${'a'.repeat(42)}/`,
      `${'a'.repeat(42)}=`,
      `${'a'.repeat(42)} `,
      `${'a'.repeat(42)}é`,
    ]) {
      expect(verifyPkce(v, pkceChallenge(v))).toBe(false);
    }
  });

  it('rejects missing verifiers', () => {
    expect(verifyPkce(undefined, RFC_CHALLENGE)).toBe(false);
    expect(verifyPkce(null, RFC_CHALLENGE)).toBe(false);
    expect(verifyPkce('', RFC_CHALLENGE)).toBe(false);
  });

  it('rejects malformed challenges', () => {
    expect(verifyPkce(RFC_VERIFIER, `${RFC_CHALLENGE}=`)).toBe(false); // padded
    expect(verifyPkce(RFC_VERIFIER, RFC_CHALLENGE.replace('-', '+'))).toBe(false); // base64, not base64url
    expect(verifyPkce(RFC_VERIFIER, RFC_CHALLENGE.slice(0, 42))).toBe(false); // too short
    expect(verifyPkce(RFC_VERIFIER, 'a'.repeat(129))).toBe(false); // too long
    expect(verifyPkce(RFC_VERIFIER, '')).toBe(false);
  });

  it('rejects a plain (non-S256) challenge equal to the verifier', () => {
    expect(verifyPkce(RFC_VERIFIER, RFC_VERIFIER)).toBe(false);
  });
});
