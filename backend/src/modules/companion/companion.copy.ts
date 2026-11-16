import type { LanguageStyle } from '../../common/types/api.types';

/**
 * Everything the friend says on its own (pushes, greetings, scripted fallbacks), in the user's language
 * style: English, or Hinglish for "hinglish" and "mixed" users. AI replies mirror the user by prompt.
 */
const hi = (lang: LanguageStyle) => lang !== 'english';
const pick = (lang: LanguageStyle, en: string, hin: string) => (hi(lang) ? hin : en);
const withName = (text: string, name: string | null) => (name ? `${text}, ${name}` : text);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface DaySummary {
  meetings: number;
  /** Formatted local time of the first meeting ("10:00 AM"). */
  firstMeetingAt: string | null;
  reminders: number;
  openItems: number;
}

export function greeting(lang: LanguageStyle, name: string | null, localHour: number): string {
  if (localHour < 12) return withName('Good morning', name);
  if (localHour < 17) return withName(pick(lang, 'Good afternoon', 'Hello'), name);
  return withName('Good evening', name);
}

/** One line about the day: "3 meetings today (first at 10:00 AM), 2 reminders and 4 open to-dos." */
export function dayHeadline(lang: LanguageStyle, d: DaySummary): string {
  if (!d.meetings && !d.reminders && !d.openItems) {
    return pick(lang, 'Your day is clear. Want to plan something?', 'Aaj ka din free hai. Kuch plan karein?');
  }
  if (hi(lang)) {
    const parts: string[] = [];
    if (d.meetings)
      parts.push(
        `${d.meetings} meeting${d.meetings === 1 ? '' : 's'}${d.firstMeetingAt ? ` (pehli ${d.firstMeetingAt} pe)` : ''}`,
      );
    if (d.reminders) parts.push(`${d.reminders} reminder${d.reminders === 1 ? '' : 's'}`);
    if (d.openItems) parts.push(`${d.openItems} to-do${d.openItems === 1 ? '' : 's'} pending`);
    // "... aur 4 to-dos pending." already reads as a sentence; otherwise end with "hain".
    return `Aaj ${joinList(parts, 'aur')}${d.openItems ? '' : ' hain'}.`;
  }
  const parts: string[] = [];
  parts.push(
    d.meetings
      ? `${plural(d.meetings, 'meeting', 'meetings')} today${d.firstMeetingAt ? ` (first at ${d.firstMeetingAt})` : ''}`
      : 'No meetings today',
  );
  if (d.reminders) parts.push(plural(d.reminders, 'reminder', 'reminders'));
  if (d.openItems) parts.push(plural(d.openItems, 'open to-do', 'open to-dos'));
  return `${joinList(parts, 'and')}.`;
}

function joinList(parts: string[], and: string): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} ${and} ${parts[parts.length - 1]}`;
}

export function morningPush(lang: LanguageStyle, name: string | null, headline: string) {
  return { title: `${withName('Good morning', name)} ☀️`, body: headline };
}

export type CheckinTone = 'normal' | 'light';

/** The evening check-in push. After a missed check-in the ask gets lighter (no guilt). */
export function checkinPush(lang: LanguageStyle, name: string | null, tone: CheckinTone) {
  if (tone === 'light') {
    return {
      title: pick(lang, withName('Hey', name) + ', quick one 🙂', withName('Hey', name) + ', bas ek sawaal 🙂'),
      body: pick(lang, 'One word for today? No pressure.', 'Aaj ka din ek word mein? Koi pressure nahi.'),
    };
  }
  return {
    title: pick(
      lang,
      `How did today go${name ? `, ${name}` : ''}?`,
      `Aaj ka din kaisa raha${name ? `, ${name}` : ''}?`,
    ),
    body: pick(lang, "Tell me in a line or two. I'm listening.", 'Ek-do line mein batao, main sun raha hoon.'),
  };
}

/** The friend's first message in the check-in chat. */
export function checkinOpening(lang: LanguageStyle, name: string | null, tone: CheckinTone): string {
  if (tone === 'light') {
    return pick(
      lang,
      `No pressure${name ? `, ${name}` : ''}. One line about today?`,
      `Koi pressure nahi${name ? `, ${name}` : ''}. Aaj ke baare mein bas ek line?`,
    );
  }
  return pick(
    lang,
    `Hey${name ? ` ${name}` : ''}, how did today go? Tell me anything: big, small, good or meh.`,
    `Hey${name ? ` ${name}` : ''}, aaj ka din kaisa raha? Kuch bhi batao: bada, chhota, accha ya meh.`,
  );
}

/** Scripted replies when the AI is off or fails (turn = number of user messages so far). */
export function checkinFallback(lang: LanguageStyle, turn: number): string {
  return turn <= 1
    ? pick(
        lang,
        'Thanks for telling me. What was the best part of today?',
        'Batane ke liye thanks. Aaj ka best part kya tha?',
      )
    : pick(
        lang,
        'Love that. Anything still on your mind before you rest?',
        'Badhiya. Sone se pehle kuch aur dimaag mein hai?',
      );
}

export function checkinClosingFallback(lang: LanguageStyle): string {
  return pick(lang, 'Thanks for sharing your day with me.', 'Apna din share karne ke liye thanks.');
}

/** "Here's tomorrow: 2 meetings (first at 10:00 AM) and 1 reminder. 2 things are still open." */
export function tomorrowLine(lang: LanguageStyle, tomorrow: DaySummary, stillOpen: number): string {
  let plan: string;
  if (!tomorrow.meetings && !tomorrow.reminders) {
    plan = pick(lang, 'Tomorrow looks clear so far.', 'Kal abhi tak free hai.');
  } else if (hi(lang)) {
    const parts: string[] = [];
    if (tomorrow.meetings)
      parts.push(
        `${tomorrow.meetings} meeting${tomorrow.meetings === 1 ? '' : 's'}${tomorrow.firstMeetingAt ? ` (pehli ${tomorrow.firstMeetingAt} pe)` : ''}`,
      );
    if (tomorrow.reminders) parts.push(`${tomorrow.reminders} reminder${tomorrow.reminders === 1 ? '' : 's'}`);
    plan = `Kal ka plan: ${joinList(parts, 'aur')}.`;
  } else {
    const parts: string[] = [];
    if (tomorrow.meetings)
      parts.push(
        `${plural(tomorrow.meetings, 'meeting', 'meetings')}${tomorrow.firstMeetingAt ? ` (first at ${tomorrow.firstMeetingAt})` : ''}`,
      );
    if (tomorrow.reminders) parts.push(plural(tomorrow.reminders, 'reminder', 'reminders'));
    plan = `Here's tomorrow: ${joinList(parts, 'and')}.`;
  }
  const open = stillOpen
    ? pick(
        lang,
        `${plural(stillOpen, 'thing is', 'things are')} still open.`,
        `${stillOpen} ${stillOpen === 1 ? 'cheez' : 'cheezein'} abhi bhi open ${stillOpen === 1 ? 'hai' : 'hain'}.`,
      )
    : pick(lang, 'Nothing is left open.', 'Sab kuch close ho gaya.');
  return `${plan} ${open}`;
}

/** The one gentle follow-up for an ignored reminder. */
export function followUpPush(lang: LanguageStyle, title: string) {
  return {
    title: pick(lang, `Still on your list: ${title}`, `Yaad dila raha hoon: ${title}`),
    body: pick(lang, 'Done, or should I remind you later?', 'Ho gaya, ya baad mein yaad dilaun?'),
  };
}

export function nudgePush(lang: LanguageStyle, name: string | null, text: string) {
  return { title: pick(lang, withName('Thinking of you', name), withName('Bas yaad aaya', name)), body: text };
}

/** How the AI should sound at each relationship stage. */
export function stageTone(stage: number): string {
  if (stage >= 3) return 'close friend: light teasing, nicknames and honest pushback are fine, always kind.';
  if (stage === 2) return 'casual: mirror their style and bring up small things they told you.';
  return 'polite and curious: warm but a little reserved; you are still getting to know them.';
}

/** Weekly recap headline: "4 meetings, 6 promises kept". */
export function recapHeadline(meetings: number, kept: number): string {
  const parts: string[] = [];
  if (meetings) parts.push(plural(meetings, 'meeting', 'meetings'));
  if (kept) parts.push(`${plural(kept, 'promise', 'promises')} kept`);
  return parts.join(', ') || 'A quiet week';
}
