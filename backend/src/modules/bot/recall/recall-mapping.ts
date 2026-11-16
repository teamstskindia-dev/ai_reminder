import type { MeetingStatus } from '../../../common/types/api.types';
import type { RecallBot, RecallCreateBotRequest, RecallTranscript } from '../../../infra/recall/recall.types';
import type { BotSettings, RecallBotSettings } from '../../content/settings.schemas';
import { BotStep, formatFailureReason } from '../runner/bot-step-error';

/**
 * Pure mapping between Recall.ai and Remi: the create-bot request, webhook events → meeting status, a finished
 * bot → outcome (recorded? transcript ready? why it failed) and Recall.ai transcripts → transcript segments.
 */

/** Google Meet caps Recall.ai's waiting-room timeout at 10 minutes. */
export const MEET_MAX_WAITING_ROOM_SECONDS = 600;

export function transcriptProvider(
  recall: RecallBotSettings,
): RecallCreateBotRequest['recording_config']['transcript']['provider'] {
  if (recall.transcription === 'meeting_captions') {
    // Captions cannot auto-detect the language; omit it to use Meet's default (English).
    return { meeting_captions: recall.languageCode === 'auto' ? {} : { language_code: recall.languageCode } };
  }
  // Post-call accuracy matters more than live latency (the report is written after the meeting).
  return { recallai_streaming: { mode: 'prioritize_accuracy', language_code: recall.languageCode } };
}

export function buildCreateBotRequest(input: {
  meetingId: string;
  meetingUrl: string;
  botName: string;
  bot: BotSettings;
}): RecallCreateBotRequest {
  const { bot } = input;
  const maxSeconds = bot.maxDurationMinutes * 60;
  const waitingSeconds = Math.min(Math.max(bot.waitingRoomTimeoutMinutes * 60, 30), MEET_MAX_WAITING_ROOM_SECONDS);
  return {
    meeting_url: input.meetingUrl,
    bot_name: input.botName.trim().slice(0, 100),
    recording_config: { transcript: { provider: transcriptProvider(bot.recall) } },
    automatic_leave: {
      waiting_room_timeout: waitingSeconds,
      noone_joined_timeout: Math.max(bot.waitingRoomTimeoutMinutes * 60, 30),
      // 0 = never leave just because the bot is alone (bounded by the maximum duration).
      everyone_left_timeout: { timeout: bot.leaveWhenAloneMinutes > 0 ? bot.leaveWhenAloneMinutes * 60 : maxSeconds },
      in_call_recording_timeout: maxSeconds,
    },
    metadata: { remi_meeting_id: input.meetingId },
  };
}

// ---- webhook events → meeting status ----

/** Live status reached by each in-call event. Never moves a meeting backwards (see STATUS_RANK). */
const EVENT_STATUS: Record<string, MeetingStatus> = {
  'bot.joining_call': 'joining',
  'bot.in_waiting_room': 'waiting_room',
  'bot.in_call_not_recording': 'in_progress',
  'bot.recording_permission_allowed': 'in_progress',
  'bot.in_call_recording': 'in_progress',
};

const STATUS_RANK: Partial<Record<MeetingStatus, number>> = {
  scheduled: 0,
  joining: 1,
  waiting_room: 2,
  in_progress: 3,
};

/** Events after which the bot is gone and its recording/transcript can be collected. */
export const FINAL_EVENTS = new Set(['bot.done', 'bot.fatal', 'transcript.done', 'transcript.failed']);

export function statusForEvent(event: string): MeetingStatus | null {
  return EVENT_STATUS[event] ?? null;
}

/** Statuses a meeting may move to `target` from (strictly earlier live statuses). */
export function statusesBefore(target: MeetingStatus): MeetingStatus[] {
  const rank = STATUS_RANK[target];
  if (rank === undefined) return [];
  return (Object.entries(STATUS_RANK) as [MeetingStatus, number][]).filter(([, r]) => r < rank).map(([s]) => s);
}

// ---- finished bot → outcome ----

const SUB_CODE_REASONS: Record<string, [BotStep, string]> = {
  // call_ended
  call_ended_by_host: ['capture', 'The host ended the meeting before anything was recorded'],
  call_ended_by_platform_idle: ['capture', 'Google Meet ended the idle call'],
  call_ended_by_platform_max_length: ['capture', 'Google Meet ended the call (maximum length)'],
  call_ended_by_platform_waiting_room_timeout: ['admission', 'Nobody admitted the bot before Google Meet timed out'],
  timeout_exceeded_waiting_room: ['admission', 'Nobody admitted the bot from the waiting room in time'],
  timeout_exceeded_noone_joined: ['admission', 'Nobody joined the meeting'],
  timeout_exceeded_everyone_left: ['capture', 'Everyone left before anything was recorded'],
  timeout_exceeded_recording_permission_denied: ['capture', 'The host did not allow recording'],
  timeout_exceeded_in_call_not_recording: ['capture', 'The bot was not allowed to record'],
  bot_kicked_from_waiting_room: ['admission', 'Host denied the request to join'],
  bot_kicked_from_call: ['capture', 'The bot was removed from the meeting'],
  bot_received_leave_call: ['leave', 'The bot was asked to leave before anything was recorded'],
  // fatal
  meeting_not_found: ['navigate', 'Google Meet could not find this meeting'],
  meeting_link_invalid: ['navigate', 'The meeting link is invalid'],
  meeting_link_expired: ['navigate', 'The meeting link has expired'],
  meeting_ended: ['join', 'The meeting had already ended'],
  meeting_full: ['join', 'The meeting is full'],
  meeting_locked: ['join', 'The meeting is locked'],
  meeting_requires_sign_in: [
    'join',
    'The meeting only admits signed-in accounts from its organization (ask the host to allow external guests)',
  ],
  google_meet_knocking_disabled: ['join', 'The meeting does not let guests ask to join'],
  google_meet_bot_blocked: ['join', 'Google Meet blocked the bot'],
  bot_errored: ['capture', 'The meeting bot hit an internal error'],
};

/** Readable failure reason for a Recall.ai sub code; unknown codes are kept (sanitised) so they can be looked up. */
export function reasonForSubCode(subCode: string | null | undefined, joined: boolean, fatal: boolean): string {
  const known = subCode ? SUB_CODE_REASONS[subCode] : undefined;
  if (known) return formatFailureReason(known[0], known[1]);
  const step: BotStep = joined ? 'capture' : fatal ? 'join' : 'admission';
  const code = (subCode ?? '').replace(/[^a-z0-9_]/gi, '').slice(0, 80);
  if (code) return formatFailureReason(step, `Recall.ai bot stopped (${code})`);
  return formatFailureReason(step, joined ? 'Nothing was recorded' : 'Not admitted to the meeting');
}

export type TranscriptState =
  { state: 'done'; downloadUrl: string } | { state: 'processing' } | { state: 'failed' } | { state: 'missing' };

export interface BotOutcome {
  /** The bot shut down (done or fatal). */
  finished: boolean;
  /** The bot recorded at some point (in_call_recording). */
  recorded: boolean;
  joinedAt: Date | null;
  leftAt: Date | null;
  /** failure_reason when nothing was recorded. */
  failureReason: string | null;
  transcript: TranscriptState;
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function transcriptState(bot: RecallBot): TranscriptState {
  const recordings = bot.recordings ?? [];
  const recording = recordings.find((r) => r.media_shortcuts?.transcript) ?? recordings[0];
  const transcript = recording?.media_shortcuts?.transcript;
  const code = transcript?.status?.code;
  if (transcript && code === 'done') {
    const url = transcript.data?.download_url;
    return url ? { state: 'done', downloadUrl: url } : { state: 'missing' };
  }
  if (code === 'failed' || code === 'deleted') return { state: 'failed' };
  if (transcript) return { state: 'processing' };
  // No transcript yet: still processing while the recording is (or no recording is listed yet).
  const recordingCode = recording?.status?.code;
  if (!recording || recordingCode === 'processing') return { state: 'processing' };
  return recordingCode === 'done' ? { state: 'missing' } : { state: 'failed' };
}

export function analyseBot(bot: RecallBot): BotOutcome {
  const changes = bot.status_changes ?? [];
  const codes = changes.map((c) => c.code);
  const fatal = changes.find((c) => c.code === 'fatal');
  const finished = codes.includes('done') || !!fatal;
  const recorded = codes.includes('in_call_recording');
  const joined = changes.find((c) => c.code === 'in_call_recording' || c.code === 'in_call_not_recording');
  const ended = [...changes].reverse().find((c) => c.code === 'call_ended');
  const last = changes[changes.length - 1];
  const leftAt = toDate(ended?.created_at) ?? (finished ? toDate(last?.created_at) : null);
  const failureReason = recorded
    ? null
    : fatal
      ? reasonForSubCode(fatal.sub_code, !!joined, true)
      : reasonForSubCode(ended?.sub_code, !!joined, false);
  return {
    finished,
    recorded,
    joinedAt: toDate(joined?.created_at),
    leftAt,
    failureReason,
    transcript: transcriptState(bot),
  };
}

// ---- transcript → segments ----

export interface ImportedSegment {
  seq: number;
  speaker: string;
  text: string;
  startMs: number;
  endMs: number | null;
}

/** Long monologues are split so each segment stays readable and within prompt-friendly sizes. */
const MAX_SEGMENT_CHARS = 1500;

function ms(seconds: number | null | undefined): number | null {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
}

function speakerName(participant: RecallTranscript[number]['participant']): string {
  const name = (participant?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (name) return name;
  const id = participant?.id;
  return id !== null && id !== undefined && String(id).length <= 20 ? `Speaker ${String(id)}` : 'Unknown';
}

export function transcriptToSegments(transcript: RecallTranscript): ImportedSegment[] {
  const segments: ImportedSegment[] = [];
  let lastStart = 0;
  for (const block of transcript) {
    const speaker = speakerName(block.participant);
    let words: string[] = [];
    let length = 0;
    let startMs: number | null = null;
    let endMs: number | null = null;
    const push = () => {
      const text = words.join(' ').replace(/\s+/g, ' ').trim();
      if (text) {
        // Timestamps only move forward (null/negative values from captions fall back to the previous start).
        const start = Math.max(startMs ?? lastStart, lastStart);
        lastStart = start;
        segments.push({
          seq: segments.length,
          speaker,
          text,
          startMs: start,
          endMs: endMs !== null ? Math.max(endMs, start) : null,
        });
      }
      words = [];
      length = 0;
      startMs = null;
      endMs = null;
    };
    for (const word of block.words) {
      const text = word.text.trim();
      if (!text) continue;
      if (words.length && length + text.length + 1 > MAX_SEGMENT_CHARS) push();
      if (!words.length) startMs = ms(word.start_timestamp?.relative);
      words.push(text);
      length += text.length + 1;
      endMs = ms(word.end_timestamp?.relative) ?? ms(word.start_timestamp?.relative) ?? endMs;
    }
    push();
  }
  return segments;
}
