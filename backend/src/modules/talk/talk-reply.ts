import type { LanguageStyle, TalkAction } from '../../common/types/api.types';

export function pick(lang: LanguageStyle, en: string, hi: string): string {
  return lang === 'hinglish' ? hi : en;
}

/** Rewrites the friend's reply when an action did not do what the model announced. */
export function consistentReply(lang: LanguageStyle, reply: string, actions: TalkAction[]): string {
  const a = actions[0];
  if (!a) return reply;
  if (a.type === 'reminder' && a.status === 'failed') {
    return pick(
      lang,
      `Sure. When should I remind you about "${a.title}"?`,
      `Bilkul. "${a.title}" ke liye kab yaad dilaun?`,
    );
  }
  if (a.type === 'meeting' && a.status === 'needs_connection') return a.note ?? reply;
  if (a.type === 'meeting' && a.status === 'proposed') {
    return a.startAt
      ? pick(
          lang,
          `I've prepared an invite for "${a.title}". Check the time and guests, then tap Send invite.`,
          `"${a.title}" ka invite taiyaar hai. Time aur guests check karo, phir Send invite dabao.`,
        )
      : pick(
          lang,
          `I couldn't find a free slot for "${a.title}". Pick a time below.`,
          `"${a.title}" ke liye free slot nahi mila. Neeche time chuno.`,
        );
  }
  if (a.type === 'email' && a.status === 'proposed') {
    return pick(
      lang,
      "Here's a draft. Edit it if you like, then send it from your email.",
      'Ye raha draft. Chaho toh badal lo, phir apne email se bhej do.',
    );
  }
  if ((a.type === 'task' || a.type === 'unavailable') && a.note) return a.note;
  return reply;
}
