import {
  headerSafe,
  heuristicTriage,
  htmlToText,
  isSensitive,
  parseAddress,
  replySubject,
  ruleCategory,
  senderMatches,
  suggestedRemindAt,
  toDetected,
  trimQuoted,
} from './email.util';

describe('email.util', () => {
  it('parses senders', () => {
    expect(parseAddress('"Neha Sharma" <Neha@Acme.com>')).toEqual({ name: 'Neha Sharma', email: 'neha@acme.com' });
    expect(parseAddress('alerts@hdfcbank.net')).toEqual({ name: null, email: 'alerts@hdfcbank.net' });
    expect(parseAddress('')).toEqual({ name: null, email: null });
  });

  it('matches senders by address or domain', () => {
    expect(senderMatches(['boss@acme.com'], 'Boss@acme.com')).toBe(true);
    expect(senderMatches(['@acme.com'], 'neha@acme.com')).toBe(true);
    expect(senderMatches(['@acme.com'], 'neha@notacme.com')).toBe(false);
  });

  it('never keeps OTPs, passwords and statements', () => {
    expect(isSensitive('Your OTP for login', null)).toBe(true);
    expect(isSensitive('Hi', '123456 is your verification code')).toBe(true);
    expect(isSensitive('Your credit card statement for October', null)).toBe(true);
    expect(isSensitive('Lunch on Friday?', 'Are you free?')).toBe(false);
  });

  it('applies the user rules before the AI', () => {
    const base = {
      fromEmail: 'news@shop.com',
      subject: 'Hello',
      text: 'x',
      labels: [] as string[],
      vip: [] as string[],
      muted: [] as string[],
    };
    expect(ruleCategory({ ...base, subject: 'Your OTP is 1234' })).toBe('sensitive');
    expect(ruleCategory({ ...base, muted: ['news@shop.com'] })).toBe('fyi');
    expect(ruleCategory({ ...base, labels: ['CATEGORY_PROMOTIONS'] })).toBe('promotion');
    expect(ruleCategory({ ...base, vip: ['@shop.com'], labels: ['CATEGORY_PROMOTIONS'] })).toBeNull();
    expect(ruleCategory(base)).toBeNull();
  });

  it('turns html into text and drops quoted replies', () => {
    expect(htmlToText('<p>Hi&nbsp;there</p><script>x()</script><br>Bye')).toBe('Hi there\n\nBye');
    expect(trimQuoted('Sounds good.\n\nOn Mon, 3 Nov 2026 at 10:00 Rahul wrote:\n> old')).toBe('Sounds good.');
  });

  it('keeps headers safe and builds reply subjects', () => {
    expect(headerSafe('Hi\r\nBcc: evil@x.com')).toBe('Hi Bcc: evil@x.com');
    expect(replySubject('Quarterly plan')).toBe('Re: Quarterly plan');
    expect(replySubject('RE: Quarterly plan')).toBe('RE: Quarterly plan');
  });

  it('triages without AI', () => {
    expect(heuristicTriage({ subject: 'Need the deck today', text: 'urgent', fromEmail: null }).category).toBe(
      'urgent',
    );
    expect(heuristicTriage({ subject: 'Can you review?', text: 'let me know', fromEmail: null }).category).toBe(
      'needs_reply',
    );
    expect(heuristicTriage({ subject: '50% off sale', text: 'unsubscribe', fromEmail: null }).category).toBe(
      'promotion',
    );
  });

  it('reads detected items defensively', () => {
    expect(toDetected([{ id: 'a', kind: 'bill', title: 'Pay bill', dueAt: null }, { kind: 'x' }, null])).toEqual([
      { id: 'a', kind: 'bill', title: 'Pay bill', dueAt: null, status: 'open', reminderId: null },
    ]);
  });

  it('suggests a sensible reminder time', () => {
    const now = new Date('2026-11-18T10:00:00Z');
    expect(suggestedRemindAt(new Date('2026-11-21T10:00:00Z'), now).toISOString()).toBe('2026-11-20T10:00:00.000Z');
    expect(suggestedRemindAt(new Date('2026-11-18T15:00:00Z'), now).toISOString()).toBe('2026-11-18T14:00:00.000Z');
    expect(suggestedRemindAt(null, now).toISOString()).toBe('2026-11-18T11:00:00.000Z');
  });
});
