import type { QueueName } from '@/lib/api/types';

export const QUEUE_META: Record<QueueName, { label: string; description: string }> = {
  'calendar-sync': { label: 'Calendar sync', description: 'Pulls Google Calendar events every 10 minutes' },
  'meeting-bot': { label: 'Meeting bot', description: 'Sends the notetaker into Google Meet calls' },
  'bot-events': { label: 'Bot events', description: 'Recall.ai status webhooks and transcript imports' },
  'ai-processing': { label: 'AI processing', description: 'Turns transcripts into reports with Gemini' },
  notifications: { label: 'Notifications', description: 'Push, in-app and email delivery and reminders' },
  digest: { label: 'Daily digest', description: 'Hourly fan-out of daily digests by timezone' },
};

export function queueLabel(name: string): string {
  return QUEUE_META[name as QueueName]?.label ?? name;
}
