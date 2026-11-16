import type { MeetingListItem, MeetingPlatform, MeetingStatus, SentimentLabel } from "@/lib/api/types";

export type StatusTone = "neutral" | "info" | "live" | "processing" | "success" | "danger" | "muted";

export const STATUS_META: Record<MeetingStatus, { label: string; tone: StatusTone; description: string }> = {
  scheduled: { label: "Scheduled", tone: "neutral", description: "The notetaker will join when the meeting starts." },
  joining: { label: "Joining", tone: "live", description: "The notetaker is joining the call." },
  waiting_room: { label: "Waiting room", tone: "live", description: "The notetaker is waiting for the host to admit it." },
  in_progress: { label: "In progress", tone: "live", description: "The notetaker is in the call and capturing captions." },
  processing: { label: "Processing", tone: "processing", description: "The AI is writing your report. This usually takes a few minutes." },
  completed: { label: "Completed", tone: "success", description: "The report is ready." },
  failed: { label: "Failed", tone: "danger", description: "Something went wrong with this meeting." },
  cancelled: { label: "Cancelled", tone: "muted", description: "This meeting was cancelled." },
  skipped: { label: "Skipped", tone: "muted", description: "The notetaker did not join this meeting." },
};

export const MEETING_STATUSES = Object.keys(STATUS_META) as MeetingStatus[];

export const LIVE_STATUSES: MeetingStatus[] = ["joining", "waiting_room", "in_progress"];

export const isLive = (status: MeetingStatus) => LIVE_STATUSES.includes(status);

export const PLATFORM_LABEL: Record<MeetingPlatform, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  teams: "Microsoft Teams",
  other: "Other",
};

/** The bot only supports Google Meet (HLD non-goals). */
export const botSupported = (m: Pick<MeetingListItem, "platform" | "meetingUrl">) =>
  m.platform === "google_meet" && Boolean(m.meetingUrl);

/** "Send bot now" is allowed for Meet links that have not started/finished yet. */
export const canSendBot = (m: Pick<MeetingListItem, "platform" | "meetingUrl" | "status">) =>
  botSupported(m) && (m.status === "scheduled" || m.status === "skipped" || m.status === "failed");

export const canBotLeave = (m: Pick<MeetingListItem, "status">) => isLive(m.status);

export const SENTIMENT_META: Record<SentimentLabel, { label: string; className: string }> = {
  positive: { label: "Positive", className: "text-success" },
  neutral: { label: "Neutral", className: "text-muted-foreground" },
  negative: { label: "Negative", className: "text-destructive" },
};

export function sentimentFromScore(score: number | null | undefined): SentimentLabel | null {
  if (score == null) return null;
  if (score >= 60) return "positive";
  if (score <= 40) return "negative";
  return "neutral";
}

/** Colour band for a 0..100 score. */
export function scoreTone(score: number | null | undefined): "good" | "ok" | "poor" | "none" {
  if (score == null) return "none";
  if (score >= 75) return "good";
  if (score >= 50) return "ok";
  return "poor";
}

/** Google Meet links, including the newer `/meet/abc-defg-hij` form used by instant meetings (the API stores the
 *  canonical `https://meet.google.com/abc-defg-hij`). */
export const MEET_URL_PATTERN = /^https:\/\/meet\.google\.com\/(?:meet\/)?[a-z]{3}-[a-z]{4}-[a-z]{3}\/?(\?.*)?$/i;
