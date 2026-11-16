import { z } from 'zod';

/**
 * The subset of Recall.ai's API Remi relies on (https://docs.recall.ai). Unknown fields are ignored so
 * additive API changes never break parsing; everything Remi reads is validated.
 */

const statusChange = z.object({
  code: z.string().max(100),
  sub_code: z.string().max(200).nullish(),
  created_at: z.string().max(60).nullish(),
});

const artifactStatus = z.object({ code: z.string().max(60) }).nullish();

const transcriptShortcut = z
  .object({
    id: z.string().max(100).nullish(),
    status: artifactStatus,
    data: z.object({ download_url: z.string().max(4096).nullish() }).nullish(),
  })
  .nullish();

const recording = z.object({
  id: z.string().max(100).nullish(),
  status: artifactStatus,
  media_shortcuts: z.object({ transcript: transcriptShortcut }).nullish(),
});

export const recallBotSchema = z.object({
  id: z.uuid(),
  status_changes: z.array(statusChange).max(500).nullish(),
  recordings: z.array(recording).max(50).nullish(),
});
export type RecallBot = z.infer<typeof recallBotSchema>;
export type RecallStatusChange = z.infer<typeof statusChange>;

const timestamp = z
  .object({
    relative: z.number().nullish(),
    absolute: z.string().nullish(),
  })
  .nullish();

/** transcript.data.download_url → JSON array of speaker blocks. */
export const recallTranscriptSchema = z
  .array(
    z.object({
      participant: z
        .object({
          id: z.union([z.number(), z.string()]).nullish(),
          name: z.string().max(500).nullish(),
        })
        .nullish(),
      language_code: z.string().max(40).nullish(),
      words: z
        .array(
          z.object({
            text: z.string().max(10_000),
            start_timestamp: timestamp,
            end_timestamp: timestamp,
          }),
        )
        .max(200_000),
    }),
  )
  .max(100_000);
export type RecallTranscript = z.infer<typeof recallTranscriptSchema>;

/** Webhook body (status-change and artifact events share the `data.bot` shape). */
export const recallWebhookSchema = z.object({
  event: z
    .string()
    .max(100)
    .regex(/^[a-z_]+(\.[a-z_]+)+$/),
  data: z.object({
    data: z
      .object({
        code: z.string().max(100).nullish(),
        sub_code: z.string().max(200).nullish(),
        updated_at: z.string().max(60).nullish(),
      })
      .nullish(),
    bot: z.object({ id: z.uuid() }).nullish(),
  }),
});
export type RecallWebhook = z.infer<typeof recallWebhookSchema>;

/** POST /api/v1/bot/ body (only the fields Remi sets). */
export interface RecallCreateBotRequest {
  meeting_url: string;
  bot_name: string;
  recording_config: {
    transcript: {
      provider:
        | { recallai_streaming: { mode: 'prioritize_accuracy' | 'prioritize_low_latency'; language_code?: string } }
        | { meeting_captions: { language_code?: string } };
    };
  };
  automatic_leave: {
    waiting_room_timeout: number;
    noone_joined_timeout: number;
    everyone_left_timeout: { timeout: number };
    in_call_recording_timeout: number;
  };
  /** Flat string map; Remi stores only its own meeting id (no personal data). */
  metadata: Record<string, string>;
}
