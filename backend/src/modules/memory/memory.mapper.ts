import type { CaptureMood, CapturePerson, MemoryItem } from '../../common/types/api.types';
import { CAPTURE_MOOD_SCORE } from './memory.util';

/** The meeting fields a memory item needs (select with MEETING_MEMORY_SELECT). */
export const MEETING_MEMORY_SELECT = {
  id: true,
  title: true,
  source: true,
  startAt: true,
  report: { select: { summary: true, insights: true } },
  participants: { select: { name: true } },
} as const;

export interface MeetingMemoryRow {
  id: string;
  title: string;
  source: string;
  startAt: Date;
  report: { summary: string; insights: unknown } | null;
  participants: { name: string }[];
}

function insightsOf(value: unknown): { people: CapturePerson[]; mood: CaptureMood | null } {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const people = Array.isArray(v.people)
    ? v.people.filter((p): p is CapturePerson => !!p && typeof (p as CapturePerson).name === 'string')
    : [];
  const mood = typeof v.mood === 'string' && v.mood in CAPTURE_MOOD_SCORE ? (v.mood as CaptureMood) : null;
  return { people, mood };
}

/** People named in a recording's insights (people the user talked about). */
export function insightPeople(value: unknown): CapturePerson[] {
  return insightsOf(value).people;
}

export function snippet(text: string | null | undefined, max = 180): string | null {
  const s = text
    ?.replace(/[#*_`>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function meetingToMemory(m: MeetingMemoryRow): MemoryItem {
  const { people, mood } = insightsOf(m.report?.insights);
  const names = [...new Set([...people.map((p) => p.name), ...m.participants.map((p) => p.name)])].filter(
    (n) => !/^(speaker\s*\d*|unknown)$/i.test(n),
  );
  return {
    kind: m.source === 'capture' ? 'conversation' : 'meeting',
    id: m.id,
    title: m.title,
    snippet: snippet(m.report?.summary),
    at: m.startAt.toISOString(),
    mood: mood ? CAPTURE_MOOD_SCORE[mood] : null,
    people: names.slice(0, 8),
  };
}

export function checkinToMemory(c: {
  id: string;
  localDate: Date;
  completedAt: Date | null;
  summary: string | null;
  mood: number | null;
}): MemoryItem {
  return {
    kind: 'checkin',
    id: c.id,
    title: 'Evening check-in',
    snippet: snippet(c.summary),
    at: (c.completedAt ?? new Date(`${c.localDate.toISOString().slice(0, 10)}T20:00:00Z`)).toISOString(),
    mood: c.mood,
    people: [],
  };
}

export function emailToMemory(e: {
  id: string;
  subject: string | null;
  summary: string | null;
  fromName: string | null;
  fromEmail: string | null;
  receivedAt: Date;
}): MemoryItem {
  const from = e.fromName || e.fromEmail;
  return {
    kind: 'email',
    id: e.id,
    title: e.subject || (from ? `Email from ${from}` : 'Email'),
    snippet: snippet(e.summary),
    at: e.receivedAt.toISOString(),
    mood: null,
    people: from ? [from] : [],
  };
}
