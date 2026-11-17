import type { TalkAction } from '../../common/types/api.types';
import { consistentReply } from './talk-reply';

const meeting = (status: 'proposed' | 'needs_connection', startAt: string | null): TalkAction => ({
  id: 'a',
  type: 'meeting',
  status,
  title: 'Call with Rahul',
  startAt,
  endAt: null,
  attendees: [],
  eventId: null,
  note: status === 'needs_connection' ? 'Connect Google Calendar in Profile so I can schedule.' : null,
});

describe('consistentReply', () => {
  it('keeps the reply when there is no action or it succeeded', () => {
    expect(consistentReply('english', 'Hi!', [])).toBe('Hi!');
    const done: TalkAction = {
      id: 'r',
      type: 'reminder',
      status: 'done',
      title: 'Call mom',
      remindAt: '2026-11-18T13:30:00Z',
      reminderId: 'x',
      note: null,
    };
    expect(consistentReply('english', 'Reminder set!', [done])).toBe('Reminder set!');
  });

  it('asks for a time when the reminder could not be set', () => {
    const failed: TalkAction = {
      id: 'r',
      type: 'reminder',
      status: 'failed',
      title: 'Call mom',
      remindAt: null,
      reminderId: null,
      note: null,
    };
    expect(consistentReply('english', 'Reminder set!', [failed])).toBe(
      'Sure. When should I remind you about "Call mom"?',
    );
    expect(consistentReply('hinglish', 'Set ho gaya!', [failed])).toContain('kab yaad dilaun');
  });

  it('never claims a proposal was scheduled', () => {
    expect(consistentReply('english', 'Done, scheduled!', [meeting('proposed', '2026-11-20T08:30:00Z')])).toContain(
      'tap Send invite',
    );
    expect(consistentReply('english', 'Done!', [meeting('proposed', null)])).toContain("couldn't find a free slot");
  });

  it('explains a missing calendar connection', () => {
    expect(consistentReply('english', 'Scheduled!', [meeting('needs_connection', null)])).toBe(
      'Connect Google Calendar in Profile so I can schedule.',
    );
  });
});
