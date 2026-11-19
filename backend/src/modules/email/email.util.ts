import type { EmailCategory, EmailDetected } from '../../common/types/api.types';

/** "Neha Sharma <neha@acme.com>" → { name, email } (lower-case email). */
export function parseAddress(value: string | null | undefined): { name: string | null; email: string | null } {
  const v = (value ?? '').trim();
  if (!v) return { name: null, email: null };
  const angle = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(v);
  if (angle) {
    const name = angle[1]
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .trim();
    return { name: name || null, email: angle[2].toLowerCase() };
  }
  const bare = /([^\s<>"]+@[^\s<>"]+)/.exec(v);
  return { name: null, email: bare ? bare[1].toLowerCase() : null };
}

/** The domain of an email address ("hdfcbank.net"). */
export function domainOf(email: string | null): string | null {
  const at = email?.lastIndexOf('@') ?? -1;
  return email && at > 0 ? email.slice(at + 1).toLowerCase() : null;
}

/** Senders lists hold addresses or whole domains ("@acme.com"). */
export function senderMatches(list: string[], email: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  const d = domainOf(e);
  return list.some((entry) => {
    const x = entry.toLowerCase();
    return x === e || (x.startsWith('@') && d === x.slice(1));
  });
}

const SENSITIVE_RE = [
  /\b(otp|one[- ]time (pass(word|code)|code)|verification code|security code|login code|sign[- ]in code)\b/i,
  /\b(password reset|reset your password|temporary password|new password)\b/i,
  /\b(account statement|e-?statement|credit card statement|bank statement|statement of account)\b/i,
  /\b(your code is|code:\s*\d{4,8}|\d{4,8} is your)\b/i,
];

/**
 * OTPs, passwords and statements (user-flow §07): never saved to memory. Their row keeps only the sender
 * so the same email is not processed twice.
 */
export function isSensitive(subject: string | null, text: string | null): boolean {
  const hay = `${subject ?? ''}\n${(text ?? '').slice(0, 1500)}`;
  return SENSITIVE_RE.some((re) => re.test(hay));
}

const PROMO_LABELS = new Set(['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL']);

/** Category decided without AI: the user's own rules and the mailbox's labels. Null → ask the AI. */
export function ruleCategory(e: {
  fromEmail: string | null;
  subject: string | null;
  text: string | null;
  labels: string[];
  vip: string[];
  muted: string[];
}): EmailCategory | null {
  if (isSensitive(e.subject, e.text)) return 'sensitive';
  if (senderMatches(e.vip, e.fromEmail)) return null; // VIPs are always summarised, then alerted
  if (senderMatches(e.muted, e.fromEmail)) return 'fyi';
  if (e.labels.some((l) => PROMO_LABELS.has(l))) return 'promotion';
  return null;
}

/** Crude HTML → text for emails without a text part (scripts and styles dropped, entities decoded). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

/** Strips quoted replies and long signatures so the AI reads what is new. */
export function trimQuoted(text: string, max = 4000): string {
  const cut = text.search(/\n(On .{5,120} wrote:|-----Original Message-----|From: .+\nSent: )/i);
  return (cut > 0 ? text.slice(0, cut) : text).trim().slice(0, max);
}

/** Removes CR/LF (header injection) and trims. */
export function headerSafe(value: string, max = 300): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, max);
}

export function replySubject(subject: string | null): string {
  const s = (subject ?? '').trim();
  return /^re:/i.test(s) ? s : `Re: ${s || '(no subject)'}`;
}

/** Deterministic triage for AI_MOCK and when the model is unavailable. */
export function heuristicTriage(e: { subject: string | null; text: string | null; fromEmail: string | null }): {
  category: EmailCategory;
  summary: string;
  why: string | null;
} {
  const hay = `${e.subject ?? ''} ${(e.text ?? '').slice(0, 800)}`.toLowerCase();
  const summary = (e.subject ?? 'New email').slice(0, 140);
  if (/(verify your account|suspended|click here to (confirm|unlock)|update your (kyc|payment))/.test(hay)) {
    return { category: 'phishing', summary, why: 'Looks like phishing: do not open links' };
  }
  if (/(unsubscribe|% off|sale|offer|deal|newsletter|webinar)/.test(hay)) {
    return {
      category: /unsubscribe/.test(hay) && !/(sale|% off|offer|deal)/.test(hay) ? 'fyi' : 'promotion',
      summary,
      why: null,
    };
  }
  if (/(urgent|asap|today|immediately|deadline|overdue|eod|by \d)/.test(hay)) {
    return { category: 'urgent', summary, why: 'Asks for something soon' };
  }
  if (/\?|(can you|could you|please (send|share|confirm|review)|let me know)/.test(hay)) {
    return { category: 'needs_reply', summary, why: 'Waiting for your answer' };
  }
  return { category: 'fyi', summary, why: null };
}

export function toDetected(raw: unknown): EmailDetected[] {
  if (!Array.isArray(raw)) return [];
  const kinds = ['deadline', 'bill', 'booking', 'travel'];
  const statuses = ['open', 'added', 'dismissed'];
  return raw
    .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
    .map((d) => ({
      id: typeof d.id === 'string' ? d.id : '',
      kind: (kinds.includes(String(d.kind)) ? d.kind : 'deadline') as EmailDetected['kind'],
      title: typeof d.title === 'string' ? d.title.slice(0, 200) : '',
      dueAt: typeof d.dueAt === 'string' ? d.dueAt : null,
      status: (statuses.includes(String(d.status)) ? d.status : 'open') as EmailDetected['status'],
      reminderId: typeof d.reminderId === 'string' ? d.reminderId : null,
    }))
    .filter((d) => d.id && d.title);
}

/**
 * When to remind about something an email mentioned: a day before it is due (same time), or an hour
 * before when that is too close, else in an hour.
 */
export function suggestedRemindAt(dueAt: Date | null, now = new Date()): Date {
  const soon = now.getTime() + 30 * 60_000;
  if (dueAt) {
    const dayBefore = dueAt.getTime() - 24 * 3600_000;
    if (dayBefore > soon) return new Date(dayBefore);
    const hourBefore = dueAt.getTime() - 3600_000;
    if (hourBefore > now.getTime() + 5 * 60_000) return new Date(hourBefore);
  }
  return new Date(now.getTime() + 3600_000);
}
