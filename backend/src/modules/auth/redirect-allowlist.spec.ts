import { isAllowedRedirect } from './redirect-allowlist';

const ALLOWLIST = ['remi://', 'exp://', 'https://app.example.com/auth'];

describe('isAllowedRedirect', () => {
  it.each([
    'remi://auth/callback',
    'remi://auth/callback?state=1',
    'exp://192.168.1.5:8081/--/auth/callback',
    'https://app.example.com/auth/callback',
    'https://app.example.com/auth',
    'https://app.example.com/auth?x=1',
    'https://APP.EXAMPLE.COM/auth/callback',
  ])('accepts %s', (uri) => {
    expect(isAllowedRedirect(uri, ALLOWLIST)).toBe(true);
  });

  it.each([
    ['javascript:alert(1)'],
    ['JavaScript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['file:///etc/passwd'],
    ['http://app.example.com/auth'],
    ['https://app.example.com.evil.com/auth'],
    ['https://app.example.com/authx'],
    ['https://app.example.com/other'],
    ['https://app.example.com:8443/auth'],
    ['https://evil.com'],
    ['https://evil.com/auth'],
    ['https://user:pw@app.example.com/auth'],
    ['https://user@app.example.com/auth'],
    ['https://app.example.com\\@evil.com/auth'],
    ['remi://x y'],
    ['remi://auth\n'],
    ['remi://auth\t/callback'],
    ['remi://auth<script>'],
    ['//evil.com'],
    ['/auth/callback'],
    [''],
    ['not a url'],
    ['other://auth/callback'],
  ])('rejects %p', (uri) => {
    expect(isAllowedRedirect(uri, ALLOWLIST)).toBe(false);
  });

  it.each([[undefined], [null], [42], [{}], [['remi://auth']]])('rejects non-string %p', (uri) => {
    expect(isAllowedRedirect(uri, ALLOWLIST)).toBe(false);
  });

  it('rejects overlong URIs (> 512 chars)', () => {
    const ok = `remi://auth/${'a'.repeat(500)}`;
    expect(ok.length).toBeLessThanOrEqual(512);
    expect(isAllowedRedirect(ok, ALLOWLIST)).toBe(true);
    expect(isAllowedRedirect(`remi://auth/${'a'.repeat(501)}`, ALLOWLIST)).toBe(false);
  });

  it('a scheme-only https:// or http:// entry never allows arbitrary web hosts', () => {
    expect(isAllowedRedirect('https://evil.com/cb', ['https://'])).toBe(false);
    expect(isAllowedRedirect('https://app.example.com/auth', ['https://'])).toBe(false);
    expect(isAllowedRedirect('http://evil.com/cb', ['http://'])).toBe(false);
  });

  it('a host-only web entry allows any path on that exact host', () => {
    expect(isAllowedRedirect('https://app.example.com/anything', ['https://app.example.com'])).toBe(true);
    expect(isAllowedRedirect('https://app.example.com/anything', ['https://app.example.com/'])).toBe(true);
    expect(isAllowedRedirect('https://sub.app.example.com/', ['https://app.example.com'])).toBe(false);
  });

  it('path entries with a trailing slash match the segment boundary', () => {
    expect(isAllowedRedirect('https://app.example.com/auth/cb', ['https://app.example.com/auth/'])).toBe(true);
    expect(isAllowedRedirect('https://app.example.com/authx', ['https://app.example.com/auth/'])).toBe(false);
  });

  it('a custom scheme entry with a host restricts the host', () => {
    expect(isAllowedRedirect('exp://192.168.1.5:8081/--/auth', ['exp://192.168.1.5:8081'])).toBe(true);
    expect(isAllowedRedirect('exp://10.0.0.9:8081/--/auth', ['exp://192.168.1.5:8081'])).toBe(false);
  });

  it('ignores malformed allowlist entries and an empty allowlist', () => {
    expect(isAllowedRedirect('remi://auth/callback', ['remi', 'not a url', ''])).toBe(false);
    expect(isAllowedRedirect('remi://auth/callback', [])).toBe(false);
  });

  it('forbidden schemes are rejected even when allow-listed', () => {
    expect(isAllowedRedirect('javascript://alert(1)', ['javascript://'])).toBe(false);
    expect(isAllowedRedirect('data://x', ['data://'])).toBe(false);
  });
});
