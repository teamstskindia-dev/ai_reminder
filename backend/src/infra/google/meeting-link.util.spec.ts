import { detectMeetingLink, isGoogleMeetUrl, platformForUrl } from './meeting-link.util';

describe('detectMeetingLink', () => {
  it('uses hangoutLink first', () => {
    expect(
      detectMeetingLink({
        hangoutLink: 'https://meet.google.com/abc-defg-hij',
        location: 'https://zoom.us/j/123456789',
      }),
    ).toEqual({
      platform: 'google_meet',
      url: 'https://meet.google.com/abc-defg-hij',
    });
  });

  it('treats an unrecognised hangoutLink as Google Meet', () => {
    expect(detectMeetingLink({ hangoutLink: 'https://meet.google.com/xyz' })).toEqual({
      platform: 'google_meet',
      url: 'https://meet.google.com/xyz',
    });
  });

  it('reads the video entry point from conferenceData (Meet)', () => {
    expect(
      detectMeetingLink({
        conferenceData: {
          entryPoints: [
            { entryPointType: 'phone', uri: 'tel:+1-555-0100' },
            {
              entryPointType: 'video',
              uri: 'https://meet.google.com/aaa-bbbb-ccc',
            },
          ],
          conferenceSolution: { key: { type: 'hangoutsMeet' } },
        },
      }),
    ).toEqual({
      platform: 'google_meet',
      url: 'https://meet.google.com/aaa-bbbb-ccc',
    });
  });

  it('reads a non-Meet conference solution (Zoom add-on)', () => {
    expect(
      detectMeetingLink({
        conferenceData: {
          entryPoints: [
            {
              entryPointType: 'video',
              uri: 'https://us02web.zoom.us/j/8123456789?pwd=abc',
            },
          ],
          conferenceSolution: { key: { type: 'addOn' } },
        },
      }),
    ).toEqual({
      platform: 'zoom',
      url: 'https://us02web.zoom.us/j/8123456789?pwd=abc',
    });
  });

  it('maps an unknown video URI to google_meet only for the hangoutsMeet solution', () => {
    expect(
      detectMeetingLink({
        conferenceData: {
          entryPoints: [{ entryPointType: 'video', uri: 'https://example.com/call/1' }],
          conferenceSolution: { key: { type: 'hangoutsMeet' } },
        },
      }),
    ).toEqual({ platform: 'google_meet', url: 'https://example.com/call/1' });
    expect(
      detectMeetingLink({
        conferenceData: {
          entryPoints: [{ entryPointType: 'video', uri: 'https://example.com/call/1' }],
          conferenceSolution: { key: { type: 'addOn' } },
        },
      }),
    ).toEqual({ platform: 'other', url: 'https://example.com/call/1' });
  });

  it('finds a Zoom URL in the location', () => {
    expect(
      detectMeetingLink({
        location: 'Zoom: https://zoom.us/j/123456789?pwd=xyz',
      }),
    ).toEqual({
      platform: 'zoom',
      url: 'https://zoom.us/j/123456789?pwd=xyz',
    });
  });

  it('finds a Teams URL in the location', () => {
    const url = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%7d';
    expect(detectMeetingLink({ location: url })).toEqual({
      platform: 'teams',
      url,
    });
    expect(detectMeetingLink({ location: 'https://teams.live.com/meet/9876543210' })).toEqual({
      platform: 'teams',
      url: 'https://teams.live.com/meet/9876543210',
    });
  });

  it('finds links inside an HTML description', () => {
    const description =
      'Join here: <a href="https://meet.google.com/qwe-rtyu-iop">Google Meet</a><br>Agenda: <b>roadmap</b>';
    expect(detectMeetingLink({ description })).toEqual({
      platform: 'google_meet',
      url: 'https://meet.google.com/qwe-rtyu-iop',
    });
  });

  it('finds a Meet link in a plain-text description', () => {
    expect(
      detectMeetingLink({
        description: 'Call: https://meet.google.com/abc-defg-hij\nThanks',
      }),
    ).toEqual({
      platform: 'google_meet',
      url: 'https://meet.google.com/abc-defg-hij',
    });
  });

  it('strips trailing punctuation', () => {
    expect(detectMeetingLink({ description: 'Join at https://zoom.us/j/555666777.' })?.url).toBe(
      'https://zoom.us/j/555666777',
    );
    expect(detectMeetingLink({ location: 'https://zoom.us/j/555666777,;' })?.url).toBe('https://zoom.us/j/555666777');
  });

  it('returns null when there is no video link', () => {
    expect(detectMeetingLink({})).toBeNull();
    expect(
      detectMeetingLink({
        location: 'Room 4B',
        description: 'See https://example.com/agenda',
      }),
    ).toBeNull();
    expect(
      detectMeetingLink({
        conferenceData: {
          entryPoints: [{ entryPointType: 'phone', uri: 'tel:+15550100' }],
        },
      }),
    ).toBeNull();
  });
});

describe('platformForUrl', () => {
  it.each([
    ['https://meet.google.com/abc-defg-hij', 'google_meet'],
    ['https://meet.google.com/lookup/abcdef', 'google_meet'],
    ['https://zoom.us/j/123', 'zoom'],
    ['https://company.zoom.us/my/someone', 'zoom'],
    ['https://teams.microsoft.com/l/meetup-join/abc', 'teams'],
    ['https://teams.live.com/meet/123', 'teams'],
    ['https://example.com/call', 'other'],
  ])('%s → %s', (url, platform) => {
    expect(platformForUrl(url)).toBe(platform);
  });
});

describe('isGoogleMeetUrl', () => {
  it.each([
    'https://meet.google.com/abc-defg-hij',
    'https://meet.google.com/abc-defg-hij?authuser=0',
    'https://meet.google.com/abcd-efgh-ijk',
    '  https://meet.google.com/abc-defg-hij  ',
  ])('accepts %s', (url) => {
    expect(isGoogleMeetUrl(url)).toBe(true);
  });

  it.each([
    'http://meet.google.com/abc-defg-hij',
    'https://meet.google.com/abc',
    'https://meet.google.com/',
    'https://zoom.us/j/123',
    'https://evil.com/meet.google.com/abc-defg-hij',
    'meet.google.com/abc-defg-hij',
  ])('rejects %s', (url) => {
    expect(isGoogleMeetUrl(url)).toBe(false);
  });
});
