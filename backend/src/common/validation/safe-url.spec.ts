import { validateSync } from 'class-validator';
import {
  FONT_FAMILY_RE,
  HEX_COLOR_RE,
  IsMeetUrl,
  IsSafeUrl,
  isJoinableMeetUrl,
  normalizeMeetUrl,
  isSafeUrl,
  MOBILE_ROUTE_RE,
  zFontFamily,
  zHexColor,
  zHttpsUrl,
  zSafeUrl,
} from './safe-url';

describe('isSafeUrl', () => {
  it.each([
    'https://example.com',
    'https://example.com/a/b?c=d#e',
    'https://res.cloudinary.com/demo/image/upload/c_fill,w_1200,h_630/cld-sample-4.jpg',
    '  https://example.com  ',
    '/pricing',
    '/p/about',
    '/',
    '/#features',
    'mailto:support@remi.example.com',
    'MAILTO:support@remi.example.com',
    'mailto:a@b.co?subject=Hi',
    'remi://ask',
    'remi://meetings/123?tab=notes',
  ])('accepts %s', (url) => {
    expect(isSafeUrl(url)).toBe(true);
  });

  it.each([
    ['//evil.com'],
    ['/\\evil.com'],
    ['javascript:alert(1)'],
    ['JaVaScRiPt:alert(1)'],
    [' javascript:alert(1)'],
    ['data:text/html;base64,PHNjcmlwdD4='],
    ['vbscript:msgbox(1)'],
    ['http://example.com'],
    ['ftp://example.com/file'],
    ['https://exa mple.com'],
    ['https://example.com/\u0000'],
    ['https://exa\tmple.com'],
    ['https://example.com/\u0085'],
    ['https://user:pw@example.com'],
    ['https://user@example.com'],
    ['https://'],
    ['mailto:nope'],
    ['mailto:a@b'],
    ['mailto:a@b.co\nBcc:x@y.z'],
    ['remi://a b'],
    ['remi://ask<script>'],
    ['REMI://ask'],
    ['example.com'],
    [''],
    ['   '],
  ])('rejects %p', (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });

  it.each([[undefined], [null], [42], [{}]])('rejects non-string %p', (value) => {
    expect(isSafeUrl(value)).toBe(false);
  });

  it('rejects overlong values', () => {
    expect(isSafeUrl(`https://example.com/${'a'.repeat(2048)}`)).toBe(false);
  });

  it('honours the relative / mailto / appScheme options', () => {
    expect(isSafeUrl('/x', { relative: false })).toBe(false);
    expect(isSafeUrl('mailto:a@b.co', { mailto: false })).toBe(false);
    expect(isSafeUrl('remi://ask', { appScheme: false })).toBe(false);
    expect(
      isSafeUrl('https://example.com', {
        relative: false,
        mailto: false,
        appScheme: false,
      }),
    ).toBe(true);
  });
});

describe('isJoinableMeetUrl', () => {
  it.each([
    'https://meet.google.com/abc-defg-hij',
    'https://meet.google.com/abc-defg-hij?authuser=0&pli=1',
    'https://meet.google.com/meet/abc-defg-hij',
    'https://meet.google.com/meet/abc-defg-hij?authuser=0',
    'https://meet.google.com/abc-defg-hij/',
  ])('accepts %s', (url) => {
    expect(isJoinableMeetUrl(url)).toBe(true);
  });

  it.each([
    ['http://meet.google.com/abc-defg-hij'],
    ['https://meet.google.com/abc-defg-hij/extra'],
    ['https://meet.google.com/meet/'],
    ['https://meet.google.com/other/abc-defg-hij'],
    ['https://meet.google.com/meet/meet/abc-defg-hij'],
    ['https://meet.google.com/ABC-defg-hij'],
    ['https://meet.google.com/abcd-efgh-ijk'],
    ['https://meet.google.com/lookup/abcdefghij'],
    ['https://meet.google.com/'],
    ['https://evil.com/abc-defg-hij'],
    ['https://meet.google.com.evil.com/abc-defg-hij'],
    ['https://meet.google.com/abc-defg-hij#frag'],
    ['https://meet.google.com/abc-defg-hij?x\ny'],
    [' https://meet.google.com/abc-defg-hij'],
    [`https://meet.google.com/abc-defg-hij?${'a'.repeat(300)}`],
    [42],
    [null],
  ])('rejects %p', (url) => {
    expect(isJoinableMeetUrl(url)).toBe(false);
  });
});

describe('regexes', () => {
  it('HEX_COLOR_RE accepts only #RRGGBB', () => {
    expect(HEX_COLOR_RE.test('#5B4FE9')).toBe(true);
    expect(HEX_COLOR_RE.test('#ffffff')).toBe(true);
    for (const v of ['#fff', '#5B4FE9FF', '5B4FE9', '#GGGGGG', '#5B4FE9 ', 'red'])
      expect(HEX_COLOR_RE.test(v)).toBe(false);
  });

  it('FONT_FAMILY_RE accepts plain family names only', () => {
    for (const v of ['Inter', 'Open Sans', 'Noto-Sans JP', 'Source Code Pro 2'])
      expect(FONT_FAMILY_RE.test(v)).toBe(true);
    for (const v of ['', 'Inter; color: red', "Comic'Sans", 'Inter</style>', 'a'.repeat(65), 'Inter,serif']) {
      expect(FONT_FAMILY_RE.test(v)).toBe(false);
    }
  });

  it('MOBILE_ROUTE_RE accepts expo-router tab names', () => {
    for (const v of ['home', 'meetings', 'action-items', 'ask2']) expect(MOBILE_ROUTE_RE.test(v)).toBe(true);
    for (const v of ['', 'Home', '/home', 'home/x', '1home', '-home', 'a'.repeat(42), 'remi://home']) {
      expect(MOBILE_ROUTE_RE.test(v)).toBe(false);
    }
  });
});

describe('zod helpers', () => {
  it('zSafeUrl trims and validates', () => {
    expect(zSafeUrl().safeParse('  /pricing ').data).toBe('/pricing');
    expect(zSafeUrl().safeParse('javascript:alert(1)').success).toBe(false);
  });

  it('zHttpsUrl only allows absolute https URLs', () => {
    expect(zHttpsUrl().safeParse('https://example.com/a.png').success).toBe(true);
    for (const v of ['/a.png', 'mailto:a@b.co', 'remi://ask', 'http://example.com']) {
      expect(zHttpsUrl().safeParse(v).success).toBe(false);
    }
  });

  it('zHexColor and zFontFamily', () => {
    expect(zHexColor().safeParse('#5B4FE9').success).toBe(true);
    expect(zHexColor().safeParse('#fff').success).toBe(false);
    expect(zFontFamily().safeParse('Inter').success).toBe(true);
    expect(zFontFamily().safeParse('Inter;').success).toBe(false);
  });
});

describe('class-validator decorators', () => {
  class Dto {
    @IsSafeUrl()
    href: unknown;

    @IsMeetUrl()
    meetingUrl: unknown;
  }

  const make = (href: unknown, meetingUrl: unknown) => Object.assign(new Dto(), { href, meetingUrl });

  it('pass for safe values', () => {
    expect(validateSync(make('/pricing', 'https://meet.google.com/abc-defg-hij'))).toHaveLength(0);
  });

  it('fail with descriptive messages for unsafe values', () => {
    const errors = validateSync(make('javascript:alert(1)', 'https://zoom.us/j/1'));
    const byProp = Object.fromEntries(errors.map((e) => [e.property, Object.values(e.constraints ?? {})]));
    expect(byProp.href?.[0]).toContain('https://');
    expect(byProp.meetingUrl?.[0]).toContain('Google Meet');
  });
});

describe('normalizeMeetUrl', () => {
  it.each([
    ['https://meet.google.com/abc-defg-hij', 'https://meet.google.com/abc-defg-hij'],
    ['https://meet.google.com/meet/nkk-ezpa-cxn', 'https://meet.google.com/nkk-ezpa-cxn'],
    ['https://meet.google.com/meet/nkk-ezpa-cxn?authuser=1&hs=179', 'https://meet.google.com/nkk-ezpa-cxn'],
    ['https://meet.google.com/abc-defg-hij/', 'https://meet.google.com/abc-defg-hij'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeMeetUrl(input)).toBe(expected);
  });

  it.each(['https://evil.com/meet/abc-defg-hij', 'http://meet.google.com/meet/abc-defg-hij', 'nope', 42])(
    'returns null for %p',
    (input) => {
      expect(normalizeMeetUrl(input)).toBeNull();
    },
  );
});
