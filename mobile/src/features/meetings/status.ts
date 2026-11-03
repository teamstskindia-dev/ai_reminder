import type { MeetingStatus, SentimentLabel } from '@/api/types';
import type { ChipTone } from '@/components/ui/Chip';

export interface StatusMeta {
  label: string;
  tone: ChipTone;
  /** Bot or AI is actively working (shows a pulsing dot / polls). */
  live: boolean;
  description: string;
}

const META: Record<MeetingStatus, StatusMeta> = {
  scheduled: { label: 'Scheduled', tone: 'neutral', live: false, description: 'The notetaker will join when the meeting starts.' },
  joining: { label: 'Joining', tone: 'info', live: true, description: 'The notetaker is joining the call…' },
  waiting_room: {
    label: 'Waiting to be admitted',
    tone: 'warning',
    live: true,
    description: 'The notetaker is in the waiting room. Ask the host to admit it.',
  },
  in_progress: { label: 'Recording', tone: 'danger', live: true, description: 'The notetaker is capturing the conversation.' },
  processing: { label: 'Writing report', tone: 'brand', live: true, description: 'Your report will be ready in a few minutes.' },
  completed: { label: 'Report ready', tone: 'success', live: false, description: 'Your meeting report is ready.' },
  failed: { label: 'Failed', tone: 'danger', live: false, description: 'Something went wrong with this meeting.' },
  cancelled: { label: 'Cancelled', tone: 'neutral', live: false, description: 'This meeting was cancelled.' },
  skipped: { label: 'Skipped', tone: 'neutral', live: false, description: 'The notetaker did not join this meeting.' },
};

export function meetingStatusMeta(status: MeetingStatus): StatusMeta {
  return META[status] ?? META.scheduled;
}

/** Whether the bot can still be sent now (contract: must have a URL and not be finished). */
export function canSendBot(status: MeetingStatus, meetingUrl: string | null): boolean {
  return Boolean(meetingUrl) && (status === 'scheduled' || status === 'failed' || status === 'skipped');
}

export function canRecallBot(status: MeetingStatus): boolean {
  return status === 'joining' || status === 'waiting_room' || status === 'in_progress';
}

export function sentimentText(label: SentimentLabel | null): string {
  if (!label) return 'No sentiment';
  return label.charAt(0).toUpperCase() + label.slice(1);
}
