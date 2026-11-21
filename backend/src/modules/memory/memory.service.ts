import { Injectable, Logger } from '@nestjs/common';
import { AppException, causeChain } from '../../common/errors/app.exception';
import type {
  MemoryDay,
  MemoryItem,
  MemorySearch,
  MemorySearchResult,
  MemoryTimeline,
} from '../../common/types/api.types';
import { safeTimeZone } from '../../common/utils/time.util';
import { GeminiService } from '../../infra/gemini/gemini.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EmbeddingService } from '../ai/embedding.service';
import { dayKey } from '../companion/rhythm.util';
import { checkinToMemory, emailToMemory, MEETING_MEMORY_SELECT, meetingToMemory, snippet } from './memory.mapper';

const PAGE = 30;
/**
 * Gemini embeddings put unrelated text around 0.5 similarity and real matches above ~0.6, so memory search
 * needs a stricter bar than Ask AI (which only uses the top chunks as context). Below it, loosely related
 * conversations are offered as "maybe one of these".
 */
const MATCH_SIMILARITY = 0.58;
const RELATED_SIMILARITY = 0.45;
/** Emails worth remembering: promotions and phishing never show up in memory. */
const EMAIL_KINDS = ['urgent', 'needs_reply', 'fyi'];
const STOPWORDS = new Set(
  'the and was were when what where who why how did does about with from that this have has had for you your are not but they them then than into over just like what kya tha thi the hai mein main mujhe mera meri kab kaise kyun'.split(
    ' ',
  ),
);

function keywords(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, 6);
}

/**
 * Memory (user-flow §10): the timeline of conversations, check-in highlights and email summaries by day,
 * search by meaning ("when was I worried about money?"), and fixing a summary or a transcript line.
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
    private readonly gemini: GeminiService,
  ) {}

  private async timezone(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    return safeTimeZone(u?.timezone ?? 'UTC');
  }

  async timeline(userId: string, before?: string): Promise<MemoryTimeline> {
    const until = before ? new Date(before) : new Date(Date.now() + 60_000);
    if (Number.isNaN(until.getTime())) throw AppException.badRequest('before must be an ISO date');
    const [tz, meetings, checkins, emails] = await Promise.all([
      this.timezone(userId),
      this.prisma.meeting.findMany({
        where: { userId, status: 'completed', report: { isNot: null }, startAt: { lt: until } },
        orderBy: { startAt: 'desc' },
        take: PAGE,
        select: MEETING_MEMORY_SELECT,
      }),
      this.prisma.dailyCheckin.findMany({
        where: { userId, status: 'completed', summary: { not: null }, completedAt: { lt: until } },
        orderBy: { completedAt: 'desc' },
        take: PAGE,
        select: { id: true, localDate: true, completedAt: true, summary: true, mood: true },
      }),
      this.prisma.emailMessage.findMany({
        where: { userId, summary: { not: null }, category: { in: EMAIL_KINDS }, receivedAt: { lt: until } },
        orderBy: { receivedAt: 'desc' },
        take: PAGE,
        select: { id: true, subject: true, summary: true, fromName: true, fromEmail: true, receivedAt: true },
      }),
    ]);
    const all = [...meetings.map(meetingToMemory), ...checkins.map(checkinToMemory), ...emails.map(emailToMemory)].sort(
      (a, b) => b.at.localeCompare(a.at),
    );
    const page = all.slice(0, PAGE);
    const more = meetings.length === PAGE || checkins.length === PAGE || emails.length === PAGE || all.length > PAGE;
    return { days: groupByDay(page, tz), nextCursor: more && page.length ? page[page.length - 1].at : null };
  }

  async search(userId: string, rawQuery: string): Promise<MemorySearch> {
    const query = rawQuery.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!query) return { query, results: [], related: [] };
    const [byMeaning, byWords] = await Promise.all([
      this.meaningMatches(userId, query, this.gemini.isMock ? 0.05 : MATCH_SIMILARITY),
      this.wordMatches(userId, query),
    ]);
    const seen = new Set<string>();
    const results: MemorySearchResult[] = [];
    for (const r of [...byMeaning, ...byWords]) {
      const key = `${r.item.kind}:${r.item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(r);
    }
    const top = results.slice(0, 20);
    return { query, results: top, related: top.length ? [] : await this.related(userId, query) };
  }

  /** Semantic search over conversation memory (pgvector). */
  private async meaningMatches(userId: string, query: string, minSimilarity: number): Promise<MemorySearchResult[]> {
    try {
      const chunks = await this.embeddings.search(userId, query, { k: 12, minSimilarity });
      const best = new Map<string, { content: string; similarity: number }>();
      for (const c of chunks) {
        const prev = best.get(c.meetingId);
        if (!prev || c.similarity > prev.similarity)
          best.set(c.meetingId, { content: c.content, similarity: c.similarity });
      }
      if (!best.size) return [];
      const meetings = await this.prisma.meeting.findMany({
        where: { userId, id: { in: [...best.keys()] }, status: 'completed' },
        select: MEETING_MEMORY_SELECT,
      });
      return meetings
        .map((m) => {
          const match = best.get(m.id)!;
          return { item: meetingToMemory(m), quote: snippet(match.content, 220), similarity: match.similarity };
        })
        .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
    } catch (err) {
      this.logger.warn({ causes: causeChain(err) }, 'memory search by meaning failed; using words only');
      return [];
    }
  }

  /** Plain word matches in summaries, check-ins and email summaries (catches exact names and words). */
  private async wordMatches(userId: string, query: string): Promise<MemorySearchResult[]> {
    const words = keywords(query);
    const terms = words.length ? words : [query.toLowerCase()];
    const any = <T extends string>(fields: T[]) =>
      terms.flatMap((t) => fields.map((f) => ({ [f]: { contains: t, mode: 'insensitive' as const } })));
    const [meetings, checkins, emails] = await Promise.all([
      this.prisma.meeting.findMany({
        where: {
          userId,
          status: 'completed',
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            ...terms.map((t) => ({ report: { summary: { contains: t, mode: 'insensitive' as const } } })),
          ],
        },
        orderBy: { startAt: 'desc' },
        take: 10,
        select: MEETING_MEMORY_SELECT,
      }),
      this.prisma.dailyCheckin.findMany({
        where: { userId, status: 'completed', OR: any(['summary']) },
        orderBy: { localDate: 'desc' },
        take: 10,
        select: { id: true, localDate: true, completedAt: true, summary: true, mood: true },
      }),
      this.prisma.emailMessage.findMany({
        where: { userId, category: { in: EMAIL_KINDS }, summary: { not: null }, OR: any(['summary', 'subject']) },
        orderBy: { receivedAt: 'desc' },
        take: 10,
        select: { id: true, subject: true, summary: true, fromName: true, fromEmail: true, receivedAt: true },
      }),
    ]);
    return [
      ...meetings.map((m) => ({ item: meetingToMemory(m), quote: null, similarity: null })),
      ...checkins.map((c) => ({ item: checkinToMemory(c), quote: null, similarity: null })),
      ...emails.map((e) => ({ item: emailToMemory(e), quote: null, similarity: null })),
    ].sort((a, b) => b.item.at.localeCompare(a.item.at));
  }

  /** Nothing matched: loosely related conversations, else the most recent memories. */
  private async related(userId: string, query: string): Promise<MemoryItem[]> {
    const loose = await this.meaningMatches(userId, query, this.gemini.isMock ? 0.01 : RELATED_SIMILARITY);
    if (loose.length) return loose.slice(0, 3).map((r) => r.item);
    const recent = await this.timeline(userId);
    return recent.days.flatMap((d) => d.items).slice(0, 5);
  }

  // ---------------------------------------------------------------- fixing text

  private async requireConversation(userId: string, id: string): Promise<void> {
    const m = await this.prisma.meeting.findFirst({ where: { id, userId }, select: { id: true } });
    if (!m) throw AppException.notFound('Conversation');
  }

  async updateSummary(userId: string, id: string, summary: string): Promise<{ summary: string }> {
    await this.requireConversation(userId, id);
    const text = summary.trim();
    const updated = await this.prisma.meetingReport
      .update({ where: { meetingId: id }, data: { summary: text } })
      .catch(() => null);
    if (!updated) throw AppException.conflict('This conversation has no summary yet.');
    return { summary: updated.summary };
  }

  async updateSegment(userId: string, id: string, seq: number, text: string): Promise<{ seq: number; text: string }> {
    await this.requireConversation(userId, id);
    const clean = text.replace(/\s+/g, ' ').trim();
    const res = await this.prisma.transcriptSegment.updateMany({
      where: { meetingId: id, seq },
      data: { text: clean },
    });
    if (!res.count) throw AppException.notFound('Transcript line');
    return { seq, text: clean };
  }
}

function groupByDay(items: MemoryItem[], tz: string): MemoryDay[] {
  const days = new Map<string, MemoryItem[]>();
  for (const item of items) {
    const key = dayKey(new Date(item.at), tz);
    days.set(key, [...(days.get(key) ?? []), item]);
  }
  return [...days.entries()].map(([date, list]) => ({ date, items: list }));
}
