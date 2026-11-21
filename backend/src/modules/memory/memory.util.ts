import type { CaptureMood, NameCorrection } from '../../common/types/api.types';

/** A recording's mood mapped onto the check-in scale (1 low … 5 great). */
export const CAPTURE_MOOD_SCORE: Record<CaptureMood, number> = { happy: 5, calm: 4, neutral: 3, stressed: 2, low: 1 };

const MAX_CORRECTIONS = 100;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nameRegex(name: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name.trim())}(?![\\p{L}\\p{N}])`, 'giu');
}

/** Collapses whitespace and caps the length; null for empty input. */
export function cleanName(value: string | null | undefined): string | null {
  const name = value?.replace(/\s+/g, ' ').trim().slice(0, 120);
  return name || null;
}

/** Speaker labels that are not a person's name ("Speaker 2", "Unknown", "Me"). */
export function isGenericSpeaker(name: string): boolean {
  return /^(speaker\s*\d*|unknown|unidentified|me|you|i|user|narrator|host|guest\s*\d*|person\s*\d*)$/i.test(
    name.trim(),
  );
}

export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** True when `text` mentions `name` as a whole word (case-insensitive, any script). */
export function mentions(text: string | null | undefined, name: string): boolean {
  return !!text && !!name.trim() && nameRegex(name).test(text);
}

/**
 * Replaces a whole name in text ("Raul" → "Rahul"), case-insensitive, never inside another word
 * ("Raul" does not touch "Raulji" or "Paraul").
 */
export function replaceName(text: string, from: string, to: string): string {
  const f = from.trim();
  const t = to.trim();
  if (!f || !t || f === t) return text;
  return text.replace(nameRegex(f), t);
}

/** True when an assignee ("Rahul Sharma") is the person ("Rahul") or one of their other spellings. */
export function isSamePerson(assignee: string | null | undefined, names: string[]): boolean {
  const a = assignee?.trim().toLowerCase();
  if (!a) return false;
  return names.some((n) => {
    const name = n.trim().toLowerCase();
    return !!name && (a === name || a.startsWith(`${name} `) || name.startsWith(`${a} `));
  });
}

export function toCorrections(value: unknown): NameCorrection[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[])
    .filter((c): c is NameCorrection => {
      const v = c as Partial<NameCorrection> | null;
      return !!v && typeof v === 'object' && typeof v.from === 'string' && typeof v.to === 'string';
    })
    .map((c) => ({ from: c.from, to: c.to }));
}

/**
 * Adds "from → to" to the user's corrections: replaces an older correction for the same name, and keeps
 * chains short ("Raul → Rahul" then "Rahul → Rahul Verma" becomes "Raul → Rahul Verma" too).
 */
export function addCorrection(list: NameCorrection[], from: string, to: string): NameCorrection[] {
  const f = from.trim();
  const t = to.trim();
  if (!f || !t || sameName(f, t)) return list;
  const next = list
    .filter((c) => !sameName(c.from, f) && !sameName(c.from, t))
    .map((c) => (sameName(c.to, f) ? { from: c.from, to: t } : c));
  return [...next, { from: f, to: t }].slice(-MAX_CORRECTIONS);
}

export function applyCorrections(text: string, corrections: NameCorrection[]): string {
  return corrections.reduce((acc, c) => replaceName(acc, c.from, c.to), text);
}

/** Facts list: trimmed, de-duplicated (case-insensitive, newest wording kept), capped. */
export function mergeFacts(current: string[], added: string[], max = 20): string[] {
  const map = new Map<string, string>();
  for (const f of [...current, ...added]) {
    const fact = f.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (fact) {
      map.delete(fact.toLowerCase());
      map.set(fact.toLowerCase(), fact);
    }
  }
  return [...map.values()].slice(-max);
}

export function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
