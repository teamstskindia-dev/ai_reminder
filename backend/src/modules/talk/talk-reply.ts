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
    if (a.canSendFromAccount) {
      return pick(
        lang,
        `Here's a draft${a.replyToEmailId ? ' reply' : ''}. Check it, then tap Send: nothing goes out before that.`,
        `Ye raha draft${a.replyToEmailId ? ' reply' : ''}. Check karo, phir Send dabao: usse pehle kuch nahi jayega.`,
      );
    }
    return pick(
      lang,
      "Here's a draft. Edit it if you like, then send it from your email.",
      'Ye raha draft. Chaho toh badal lo, phir apne email se bhej do.',
    );
  }
  if (a.type === 'task' && a.status === 'proposed') {
    return pick(
      lang,
      `Ready to send "${a.title}" to ${toolName(a.tool)}. Check it, then tap Send.`,
      `"${a.title}" ${toolName(a.tool)} mein bhejne ke liye taiyaar hai. Check karo, phir Send dabao.`,
    );
  }
  if (a.type === 'task' && a.status === 'done' && !a.note && a.toolTaskId) {
    return pick(
      lang,
      `Created in ${toolName(a.tool)}${a.externalKey ? ` as ${a.externalKey}` : ''}.`,
      `${toolName(a.tool)} mein bana diya${a.externalKey ? ` (${a.externalKey})` : ''}.`,
    );
  }
  if (a.type === 'email_summary') {
    if (!a.groups.length) return a.note ?? reply;
    const parts = a.groups.map((g) => `${g.items.length} ${g.label.toLowerCase()}`);
    return pick(lang, `Here's what I found: ${parts.join(', ')}.`, `Ye mila: ${parts.join(', ')}.`);
  }
  if (a.type === 'tool_list' && a.note) return a.note;
  if (a.type === 'note' && a.status === 'proposed') {
    return pick(
      lang,
      "Here's the note for Notion. Edit it if you like, then tap Save.",
      'Notion ke liye note taiyaar hai. Chaho toh badlo, phir Save dabao.',
    );
  }
  if (a.type === 'pause' && a.note) return a.note;
  if ((a.type === 'task' || a.type === 'unavailable') && a.note) return a.note;
  return reply;
}

const TOOL_NAMES: Record<string, string> = {
  jira: 'Jira',
  notion: 'Notion',
  linear: 'Linear',
  todoist: 'Todoist',
  asana: 'Asana',
};

export function toolName(tool: string): string {
  return TOOL_NAMES[tool.toLowerCase()] ?? tool;
}
