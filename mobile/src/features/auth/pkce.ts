import { CryptoDigestAlgorithm, digest, getRandomBytes } from 'expo-crypto';

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** RFC 4648 §5 base64url without padding. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += BASE64URL[(n >> 18) & 63] + BASE64URL[(n >> 12) & 63] + BASE64URL[(n >> 6) & 63] + BASE64URL[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += BASE64URL[(n >> 18) & 63] + BASE64URL[(n >> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += BASE64URL[(n >> 18) & 63] + BASE64URL[(n >> 12) & 63] + BASE64URL[(n >> 6) & 63];
  }
  return out;
}

function asciiBytes(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(value.length));
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0x7f;
  return bytes;
}

/** S256 code challenge for a verifier: base64url(sha256(ascii(verifier))). */
export async function codeChallengeFor(verifier: string): Promise<string> {
  const hash = await digest(CryptoDigestAlgorithm.SHA256, asciiBytes(verifier));
  return base64UrlEncode(new Uint8Array(hash));
}

/** RFC 7636 verifier (32 random bytes → 43 base64url chars) and its S256 challenge. */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64UrlEncode(getRandomBytes(32));
  return { verifier, challenge: await codeChallengeFor(verifier) };
}
