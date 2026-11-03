import { renderTemplate, templateVariables, truncate } from './template.util';

describe('renderTemplate', () => {
  it('replaces {{var}} placeholders', () => {
    expect(renderTemplate('Hello {{name}}!', { name: 'Priya' })).toBe('Hello Priya!');
  });

  it('allows whitespace inside braces', () => {
    expect(renderTemplate('{{ name }} / {{  name}}', { name: 'A' })).toBe('A / A');
  });

  it('renders missing, null and undefined variables as empty strings', () => {
    expect(renderTemplate('[{{a}}][{{b}}][{{c}}]', { b: null, c: undefined })).toBe('[][][]');
  });

  it('stringifies numbers and booleans (including 0 and false)', () => {
    expect(
      renderTemplate('{{n}} {{z}} {{t}} {{f}}', {
        n: 42,
        z: 0,
        t: true,
        f: false,
      }),
    ).toBe('42 0 true false');
  });

  it('replaces repeated variables', () => {
    expect(renderTemplate('{{x}}-{{x}}-{{x}}', { x: 'y' })).toBe('y-y-y');
  });

  it('does not recursively render values that contain placeholders', () => {
    expect(renderTemplate('{{a}}', { a: '{{b}}', b: 'nope' })).toBe('{{b}}');
  });

  it('supports dotted names and leaves malformed placeholders alone', () => {
    expect(renderTemplate('{{user.name}} {single} {{ }}', { 'user.name': 'Mei' })).toBe('Mei {single} {{ }}');
  });

  describe('seed notification templates (prisma/seed.sql)', () => {
    const vars = {
      meetingTitle: 'Weekly sync',
      minutes: 10,
      botName: 'Remi Notetaker',
      startTime: '10:00 AM',
      actionItemCount: 3,
      summaryPreview: 'We agreed to ship on Friday.',
      summary: 'We agreed to **ship** on Friday.',
      url: 'http://localhost:3000/analytics/reports/abc',
      dueRelative: 'tomorrow at 9:00 AM',
      title: 'Send the deck',
      body: 'Attach Q3 numbers',
      meetingCount: 2,
      firstMeeting: 'First: Standup at 9:00 AM',
      date: 'Tuesday, November 3, 2026',
      digestMarkdown: '- Standup\n- Review',
      reason: 'The host did not admit the bot',
    };

    it.each([
      ['meeting_upcoming title', '{{meetingTitle}} starts in {{minutes}} min', 'Weekly sync starts in 10 min'],
      [
        'meeting_upcoming body',
        '{{botName}} will join and take notes for you.',
        'Remi Notetaker will join and take notes for you.',
      ],
      [
        'meeting_upcoming email',
        'Your meeting **{{meetingTitle}}** starts at {{startTime}}. {{botName}} will join and take notes.',
        'Your meeting **Weekly sync** starts at 10:00 AM. Remi Notetaker will join and take notes.',
      ],
      ['report_ready title', 'Your notes for "{{meetingTitle}}" are ready', 'Your notes for "Weekly sync" are ready'],
      [
        'report_ready body',
        '{{actionItemCount}} action items · {{summaryPreview}}',
        '3 action items · We agreed to ship on Friday.',
      ],
      [
        'report_ready email',
        '{{summary}}\n\n[Open the full report]({{url}})',
        'We agreed to **ship** on Friday.\n\n[Open the full report](http://localhost:3000/analytics/reports/abc)',
      ],
      ['action_item_due title', 'Due {{dueRelative}}: {{title}}', 'Due tomorrow at 9:00 AM: Send the deck'],
      ['action_item_due body', '{{meetingTitle}}', 'Weekly sync'],
      ['reminder title', '{{title}}', 'Send the deck'],
      ['reminder body', '{{body}}', 'Attach Q3 numbers'],
      [
        'daily_digest title',
        'Your day: {{meetingCount}} meetings, {{actionItemCount}} open items',
        'Your day: 2 meetings, 3 open items',
      ],
      ['daily_digest subject', 'Your Remi digest for {{date}}', 'Your Remi digest for Tuesday, November 3, 2026'],
      ['bot_failed title', 'Could not join "{{meetingTitle}}"', 'Could not join "Weekly sync"'],
      [
        'bot_failed email',
        'Remi could not join **{{meetingTitle}}**: {{reason}}',
        'Remi could not join **Weekly sync**: The host did not admit the bot',
      ],
    ])('%s', (_name, template, expected) => {
      expect(renderTemplate(template, vars)).toBe(expected);
    });
  });
});

describe('templateVariables', () => {
  it('lists unique variable names in order of first appearance', () => {
    expect(templateVariables('{{b}} {{ a }} {{b}} {{c.d}}')).toEqual(['b', 'a', 'c.d']);
  });

  it('returns an empty list when there are no variables', () => {
    expect(templateVariables('plain text {not}')).toEqual([]);
  });
});

describe('truncate', () => {
  it('returns short text unchanged (whitespace collapsed and trimmed)', () => {
    expect(truncate('  hello   world  ', 20)).toBe('hello world');
  });

  it('cuts long text with an ellipsis within the max length', () => {
    const out = truncate('abcdefghij', 5);
    expect(out).toBe('abcd…');
    expect(out.length).toBe(5);
  });

  it('keeps text exactly at the limit', () => {
    expect(truncate('abcde', 5)).toBe('abcde');
  });

  it('trims trailing spaces before the ellipsis', () => {
    expect(truncate('abc defgh', 5)).toBe('abc…');
  });
});
