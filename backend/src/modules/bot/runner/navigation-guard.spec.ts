import { isAllowedNavigation, isMeetPage } from './navigation-guard';
import { textPattern } from './text-pattern';

describe('isAllowedNavigation', () => {
  it.each([
    'https://meet.google.com/abc-defg-hij',
    'https://meet.google.com/abc-defg-hij?authuser=0',
    'https://accounts.google.com/ServiceLogin?continue=https://meet.google.com',
    'https://www.google.com/',
    'https://google.com/',
    'https://ssl.gstatic.com/x.js',
    'about:blank',
  ])('allows %s', (url) => {
    expect(isAllowedNavigation(url)).toBe(true);
  });

  it.each([
    'http://meet.google.com/abc-defg-hij',
    'https://meet.google.com.evil.example/abc',
    'https://evilgoogle.com/',
    'https://google.com.attacker.net/',
    'https://meet.google.com@evil.example/',
    'https://user:pass@meet.google.com/',
    'https://meet.google.com:8443/abc',
    'https://example.com/download.exe',
    'file:///etc/passwd',
    'data:text/html,<script>alert(1)</script>',
    'javascript:alert(1)',
    'chrome://settings',
    'not a url',
    '',
  ])('blocks %s', (url) => {
    expect(isAllowedNavigation(url)).toBe(false);
  });
});

describe('isMeetPage', () => {
  it('detects Meet pages only', () => {
    expect(isMeetPage('https://meet.google.com/abc-defg-hij')).toBe(true);
    expect(isMeetPage('https://accounts.google.com/signin')).toBe(false);
    expect(isMeetPage('garbage')).toBe(false);
  });
});

describe('textPattern', () => {
  it('builds an escaped alternation from "a|b|c"', () => {
    const source = textPattern('Ask to join|Join now|Join (anyway)?');
    expect(source).toBe('Ask to join|Join now|Join \\(anyway\\)\\?');
    expect(new RegExp(source ?? '', 'i').test('JOIN NOW')).toBe(true);
  });

  it('returns null for empty input', () => {
    expect(textPattern('')).toBeNull();
    expect(textPattern(undefined)).toBeNull();
    expect(textPattern(' | ')).toBeNull();
  });
});
