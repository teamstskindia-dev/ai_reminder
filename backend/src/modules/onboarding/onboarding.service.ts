import { Injectable, Logger } from '@nestjs/common';
import { Schema, Type } from '@google/genai';
import { z } from 'zod';
import { AppException, causeChain } from '../../common/errors/app.exception';
import { detectFileType } from '../../common/files/detect-file-type';
import { MB, validateMeetingUpload } from '../../common/files/file-validation';
import type {
  LanguageStyle,
  OnboardingChatMessage,
  OnboardingChatReply,
  ProfileStatus,
  User,
  UserProfile,
} from '../../common/types/api.types';
import { renderTemplate } from '../../common/utils/template.util';
import { GeminiService, parseJsonLoose } from '../../infra/gemini/gemini.service';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PromptsRepository } from '../ai/prompts.repository';
import { SettingsService } from '../content/settings.service';
import { NotificationProducer } from '../notifications/notification-producer.service';
import { toUser } from '../users/users.mapper';
import { UsersRepository } from '../users/users.repository';
import {
  copyFor,
  detectLanguageStyle,
  extractName,
  heuristicProfile,
  STEP_INSTRUCTIONS,
  TOTAL_STEPS,
} from './onboarding.language';

export const MAX_VOICE_NOTE_BYTES = 15 * MB;

const LANGUAGE_STYLES = ['english', 'hinglish', 'mixed'] as const;

const S = (type: Type, extra: Partial<Schema> = {}): Schema => ({ type, ...extra });

const PROFILE_RESPONSE_SCHEMA: Schema = S(Type.OBJECT, {
  properties: {
    preferredName: S(Type.STRING, { nullable: true }),
    occupation: S(Type.STRING, { nullable: true }),
    currentFocus: S(Type.STRING, { nullable: true }),
    communicationStyle: S(Type.STRING, { nullable: true }),
    languageStyle: S(Type.STRING, { enum: [...LANGUAGE_STYLES] }),
    tone: S(Type.STRING, { nullable: true }),
    facts: S(Type.ARRAY, { items: S(Type.STRING) }),
    summary: S(Type.STRING, { nullable: true }),
  },
  required: ['languageStyle', 'facts'],
});

const nullableText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => {
      const t = v?.replace(/\s+/g, ' ').trim();
      return t ? t.slice(0, max) : null;
    });

const profileOutputSchema = z.object({
  preferredName: nullableText(60),
  occupation: nullableText(160),
  currentFocus: nullableText(300),
  communicationStyle: nullableText(160),
  languageStyle: z.enum(LANGUAGE_STYLES).catch('english'),
  tone: nullableText(40),
  facts: z
    .array(z.string())
    .catch([])
    .transform((list) =>
      list
        .map((f) => f.replace(/\s+/g, ' ').trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 8),
    ),
  summary: nullableText(600),
});

const TRANSCRIBE_RESPONSE_SCHEMA: Schema = S(Type.OBJECT, {
  properties: { text: S(Type.STRING) },
  required: ['text'],
});

const TRANSCRIBE_PROMPT = `Transcribe this short voice note exactly as spoken.
The speaker may mix Hindi and English (Hinglish). Write Hindi words in Latin script the way people text (for example "kya haal hai") and English words in English.
Do not translate, summarise or add anything. Return JSON {"text": "..."}. If there is no speech, return an empty string.`;

type ProfileRow = Prisma.UserProfileGetPayload<object>;

function toProfile(row: ProfileRow | null): UserProfile {
  if (!row) {
    return {
      status: 'pending',
      preferredName: null,
      occupation: null,
      currentFocus: null,
      communicationStyle: null,
      languageStyle: 'english',
      tone: null,
      facts: [],
      summary: null,
      updatedAt: null,
    };
  }
  return {
    status: row.status as ProfileStatus,
    preferredName: row.preferredName,
    occupation: row.occupation,
    currentFocus: row.currentFocus,
    communicationStyle: row.communicationStyle,
    languageStyle: row.languageStyle as LanguageStyle,
    tone: row.tone,
    facts: Array.isArray(row.facts) ? row.facts.filter((f): f is string => typeof f === 'string') : [],
    summary: row.summary,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first.slice(0, 40) : null;
}

/** Strips wrapping quotes / a stray "Friend:" or ": " prefix the model sometimes adds, and caps the length. */
export function cleanReply(text: string): string {
  let s = text.trim().replace(/^(friend|remi|assistant)?\s*:\s*/i, '');
  s = s.replace(/^["“”']+|["“”']+$/g, '').trim();
  return s.length > 600 ? `${s.slice(0, 599)}…` : s;
}

function transcriptOf(messages: OnboardingChatMessage[]): string {
  return messages.map((m) => `${m.role === 'user' ? 'User' : 'Friend'}: ${m.content}`).join('\n');
}

/**
 * The companion's first-run flow (user-flow §02): the get-to-know-you chat that mirrors the user's
 * language, the first personality profile, voice answers, and finishing onboarding (welcome email).
 * Every AI step has a deterministic fallback so onboarding never blocks on the AI.
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly prompts: PromptsRepository,
    private readonly settings: SettingsService,
    private readonly users: UsersRepository,
    private readonly notifications: NotificationProducer,
  ) {}

  async getProfile(userId: string): Promise<UserProfile> {
    return toProfile(await this.prisma.userProfile.findUnique({ where: { userId } }));
  }

  /** Forgets everything the profile holds (the user can always see, fix or delete what the friend knows). */
  async resetProfile(userId: string): Promise<void> {
    await this.prisma.userProfile.deleteMany({ where: { userId } });
  }

  async chat(userId: string, messages: OnboardingChatMessage[]): Promise<OnboardingChatReply> {
    const answers = messages.filter((m) => m.role === 'user').map((m) => m.content.trim());
    const languageStyle = detectLanguageStyle(answers);
    const copy = copyFor(languageStyle);
    const step = Math.min(answers.length, TOTAL_STEPS);
    const done = answers.length >= TOTAL_STEPS;
    const base = { step, totalSteps: TOTAL_STEPS, done, languageStyle };

    const [user, branding] = await Promise.all([this.users.getById(userId), this.settings.get('branding')]);
    if (!answers.length) {
      return { ...base, reply: copy.opening(firstName(user.name), branding.appName) };
    }

    const preferredName = extractName(answers[0]) ?? firstName(user.name);
    const fallback = done ? copy.closing : copy.questions[step](preferredName);
    if (this.gemini.isMock) return { ...base, reply: fallback };

    try {
      const [ai, prompt] = await Promise.all([this.settings.get('ai'), this.prompts.get('onboarding_chat')]);
      if (!prompt) return { ...base, reply: fallback };
      const systemInstruction = renderTemplate(prompt.content, {
        appName: branding.appName,
        userName: preferredName ?? 'a new user',
        step: Math.min(step + 1, TOTAL_STEPS),
        totalSteps: TOTAL_STEPS,
        instruction: STEP_INSTRUCTIONS[step] ?? STEP_INSTRUCTIONS[TOTAL_STEPS],
      });
      const reply = await this.gemini.generateText({
        operation: 'onboarding_chat',
        model: ai.model,
        systemInstruction,
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content.slice(0, 1000) }],
        })),
        temperature: 0.8,
        // Thinking models spend part of this budget before answering; a small cap truncates the reply.
        maxOutputTokens: 4096,
      });
      const cleaned = cleanReply(reply);
      return { ...base, reply: cleaned || fallback };
    } catch (err) {
      this.logger.warn({ causes: causeChain(err) }, 'onboarding chat fell back to the scripted question');
      return { ...base, reply: fallback };
    }
  }

  /** Builds and stores the first personality profile from the chat. No answers → profile marked skipped. */
  async buildProfile(userId: string, messages: OnboardingChatMessage[]): Promise<UserProfile> {
    const answered = messages.some((m) => m.role === 'user' && m.content.trim());
    if (!answered) return this.saveProfile(userId, 'skipped', null);

    let extracted = heuristicProfile(messages);
    if (!this.gemini.isMock) {
      try {
        const [ai, prompt, branding, user] = await Promise.all([
          this.settings.get('ai'),
          this.prompts.get('onboarding_profile'),
          this.settings.get('branding'),
          this.users.getById(userId),
        ]);
        if (prompt) {
          const { text } = await this.gemini.generateJson({
            operation: 'onboarding_profile',
            model: ai.model,
            systemInstruction: renderTemplate(prompt.content, {
              appName: branding.appName,
              userName: firstName(user.name) ?? 'the user',
            }),
            contents: `<conversation>\n${transcriptOf(messages)}\n</conversation>`,
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseSchema: PROFILE_RESPONSE_SCHEMA,
          });
          const parsed = profileOutputSchema.parse(parseJsonLoose(text));
          // The detector sees exactly what the user typed; trust it when the model disagrees on "english".
          const detected = detectLanguageStyle(messages.filter((m) => m.role === 'user').map((m) => m.content));
          extracted = {
            ...parsed,
            preferredName: parsed.preferredName ?? extracted.preferredName,
            languageStyle:
              parsed.languageStyle === 'english' && detected !== 'english' ? detected : parsed.languageStyle,
          };
        }
      } catch (err) {
        this.logger.warn({ causes: causeChain(err) }, 'profile extraction fell back to the raw answers');
      }
    }
    return this.saveProfile(userId, 'completed', extracted);
  }

  /** Transcribes a short voice answer (English, Hindi or Hinglish). */
  async transcribe(file: { originalname?: string; buffer: Buffer } | undefined): Promise<{ text: string }> {
    if (!file?.buffer?.length) throw AppException.badRequest('Attach the voice note as `file`');
    if (file.buffer.length > MAX_VOICE_NOTE_BYTES)
      throw AppException.payloadTooLarge('Voice notes can be at most 15 MB');
    const upload = validateMeetingUpload(file.originalname, file.buffer, await detectFileType(file.buffer));
    if (upload.kind !== 'audio')
      throw AppException.unsupportedMedia('Send an audio recording (m4a, mp3, wav, webm, ogg)');
    if (this.gemini.isMock) return { text: 'This is a sample transcription (AI_MOCK is on).' };

    const ai = await this.settings.get('ai');
    const raw = await this.gemini.transcribeAudio({
      model: ai.model,
      prompt: TRANSCRIBE_PROMPT,
      audio: new Blob([new Uint8Array(file.buffer)], { type: upload.mime }),
      mimeType: upload.mime,
      responseSchema: TRANSCRIBE_RESPONSE_SCHEMA,
      maxOutputTokens: 4096,
    });
    const parsed = z.object({ text: z.string() }).safeParse(parseJsonLoose(raw));
    return { text: parsed.success ? parsed.data.text.replace(/\s+/g, ' ').trim().slice(0, 1000) : '' };
  }

  /**
   * Finishes first-run onboarding: stamps `onboardedAt`, marks an unfinished profile as skipped, and
   * sends the welcome email once.
   */
  async complete(userId: string): Promise<User> {
    const user = await this.users.getById(userId);
    if (user.onboardedAt) return toUser(user);

    const existing = await this.prisma.userProfile.findUnique({ where: { userId } });
    if (!existing || existing.status === 'pending') await this.saveProfile(userId, 'skipped', null);
    await this.users.update(userId, { onboardedAt: new Date() });

    const [branding, profile] = await Promise.all([
      this.settings.get('branding'),
      this.prisma.userProfile.findUnique({ where: { userId } }),
    ]);
    await this.notifications.notify({
      userId,
      type: 'welcome',
      templateKey: 'welcome',
      vars: { name: profile?.preferredName ?? firstName(user.name) ?? 'there', appName: branding.appName },
      data: { url: '/dashboard' },
    });
    return toUser(await this.users.getById(userId));
  }

  private async saveProfile(
    userId: string,
    status: ProfileStatus,
    data: Omit<UserProfile, 'updatedAt' | 'status'> | null,
  ): Promise<UserProfile> {
    const fields = data
      ? {
          preferredName: data.preferredName,
          occupation: data.occupation,
          currentFocus: data.currentFocus,
          communicationStyle: data.communicationStyle,
          languageStyle: data.languageStyle,
          tone: data.tone,
          facts: data.facts as Prisma.InputJsonValue,
          summary: data.summary,
        }
      : {};
    const row = await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, status, ...fields },
      update: { status, ...fields },
    });
    return toProfile(row);
  }
}
