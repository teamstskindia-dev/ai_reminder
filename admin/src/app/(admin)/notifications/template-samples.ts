/** Variables the backend renders per notification template key (backend/supabase/seed.sql). */
export const TEMPLATE_VARIABLES: Record<string, string[]> = {
  meeting_upcoming: ['meetingTitle', 'minutes', 'botName', 'startTime'],
  report_ready: ['meetingTitle', 'actionItemCount', 'summaryPreview', 'summary', 'url'],
  action_item_due: ['title', 'dueRelative', 'meetingTitle'],
  reminder: ['title', 'body'],
  daily_digest: ['meetingCount', 'actionItemCount', 'firstMeeting', 'date', 'digestMarkdown'],
  bot_failed: ['meetingTitle', 'reason'],
};

/** Sample values used for the rendered preview. */
export const SAMPLE_VALUES: Record<string, string> = {
  meetingTitle: 'Weekly product sync',
  minutes: '10',
  botName: 'Remi Notetaker',
  startTime: '10:30 AM',
  actionItemCount: '3',
  summaryPreview: 'The team agreed to move calendar connection after sign-up and ship the beta on Friday…',
  summary:
    'The team reviewed the **Q4 launch plan**. Calendar connection moves to after sign-up, and the beta ships on Friday.\n\n- Priya sends the deck to leadership\n- Mei updates the Figma flows',
  url: 'https://app.remi.example.com/analytics/reports/123',
  title: 'Send the launch deck to leadership',
  dueRelative: 'tomorrow at 9:00',
  body: 'You promised this in the weekly sync.',
  meetingCount: '4',
  firstMeeting: 'First up: Design review at 10:30',
  date: 'Tuesday, 3 November',
  digestMarkdown:
    '**Today**\n- 10:30 Design review\n- 14:00 Customer call with Acme\n\n**Open action items**\n- Send the launch deck (due today)',
  reason: 'Nobody admitted the notetaker within 10 minutes.',
  userName: 'Priya',
};
