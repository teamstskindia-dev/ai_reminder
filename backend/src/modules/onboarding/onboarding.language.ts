import type { LanguageStyle, OnboardingChatMessage, UserProfile } from '../../common/types/api.types';

/**
 * Common Hindi words as people type them in Latin script. Used to mirror the user's language before
 * (and when) the AI is not available. Deliberately conservative: English homographs are left out.
 */
// prettier-ignore
const HINGLISH_WORDS = new Set([
  'hai', 'hain', 'ho', 'hoon', 'hu', 'tha', 'thi', 'the', 'kya', 'kyu', 'kyun', 'kyunki', 'nahi', 'nahin', 'nhi',
  'mera', 'meri', 'mere', 'mujhe', 'mujhko', 'main', 'mai', 'hum', 'tum', 'aap', 'apna', 'apni', 'kaise', 'kaisa',
  'acha', 'accha', 'achha', 'theek', 'thik', 'yaar', 'yar', 'bhai', 'kar', 'karo', 'karna', 'karta', 'karti',
  'raha', 'rahi', 'rahe', 'bahut', 'bohot', 'thoda', 'kuch', 'matlab', 'abhi', 'sab', 'kaam', 'ghar', 'wala',
  'wali', 'lekin', 'par', 'bas', 'bolo', 'batao', 'chal', 'chalo', 'haan', 'ji', 'naam', 'aajkal', 'dimaag',
  'mein', 'se', 'ko', 'ka', 'ki', 'ke', 'aur', 'bhi', 'toh', 'to', 'jo', 'koi', 'kab', 'kahan', 'kitna', 'sakta',
  'sakti', 'chahiye', 'pata', 'lagta', 'lagti', 'baat', 'dost', 'zindagi', 'padhai', 'naukri',
]);
/** Words above that are also common English and only count next to other Hindi words. */
const AMBIGUOUS = new Set(['to', 'the', 'main', 'par', 'ho', 'se', 'ko', 'ka', 'ki', 'ke', 'jo', 'koi', 'bas', 'mai']);

/** Detects English, Hinglish (Hindi in Latin script) or a mix from what the user wrote. */
export function detectLanguageStyle(texts: string[]): LanguageStyle {
  const joined = texts.join(' ');
  if (/[ऀ-ॿ]/.test(joined)) return 'hinglish';
  const words = joined.toLowerCase().match(/[a-z]+/g) ?? [];
  if (!words.length) return 'english';
  const strong = words.filter((w) => HINGLISH_WORDS.has(w) && !AMBIGUOUS.has(w)).length;
  const weak = words.filter((w) => AMBIGUOUS.has(w)).length;
  const hindi = strong === 0 ? 0 : strong + weak * 0.5;
  const ratio = hindi / words.length;
  if (ratio >= 0.3) return 'hinglish';
  if (strong >= 1 && ratio >= 0.08) return 'mixed';
  return 'english';
}

export const TOTAL_STEPS = 4;

interface Copy {
  opening: (name: string | null, appName: string) => string;
  questions: ((preferredName: string | null) => string)[];
  closing: string;
}

const EN: Copy = {
  opening: (name, appName) =>
    `Hey${name ? ` ${name}` : ''}! 👋 I'm ${appName}, your new AI friend. I remember the important stuff so you don't have to. First things first: what should I call you?`,
  questions: [
    () => 'What should I call you?',
    (n) => `Nice to meet you${n ? `, ${n}` : ''}! What do you do: work, study, something else?`,
    () => "Got it. What's been on your mind lately?",
    () =>
      'Last one: how do you like me to talk to you? Chill and funny, straight to the point, or something else? English, Hinglish or a mix all work.',
  ],
  closing: "Love it. I've got a good first picture of you, and I'll keep learning as we go. Let's set up a few things!",
};

const HI: Copy = {
  opening: EN.opening,
  questions: [
    () => 'Main aapko kya bulaun?',
    (n) => `Nice to meet you${n ? `, ${n}` : ''}! Aap kya karte ho: job, padhai, ya kuch aur?`,
    () => 'Samjha. Aajkal dimaag mein kya chal raha hai?',
    () =>
      'Last sawaal: main aapse kaise baat karun? Chill aur funny, ekdum to-the-point, ya kuch aur? English, Hinglish, mix, sab chalega.',
  ],
  closing:
    'Perfect! Aapke baare mein achhi shuruaat ho gayi, aur main aage bhi seekhta rahunga. Chalo kuch cheezein set karte hain!',
};

export function copyFor(style: LanguageStyle): Copy {
  return style === 'english' ? EN : HI;
}

/** What the model should do on each turn (1-based step = number of answers so far). */
export const STEP_INSTRUCTIONS: Record<number, string> = {
  1: 'ask what they do: work, study or something else.',
  2: 'ask what has been on their mind lately.',
  3: 'ask how they like to be talked to (for example chill and funny, or straight to the point), and say that English, Hinglish or a mix are all fine.',
  4: "do not ask anything. Thank them warmly, mention in a few words one thing you'll remember about them, and say you're ready to set up a few things together.",
};

const NAME_PREFIXES = [
  /^(hi|hey|hello|hola|namaste)[\s,!.]*/i,
  /^(you can |u can |just )?call me\s+/i,
  /^(i am|i'm|im|my name is|my name's|it's|its|this is)\s+/i,
  /^(mera naam|mujhe|main|mai)\s+/i,
];

/** Best-effort preferred name from a free-text answer ("call me Vij", "mera naam Rohit hai"). */
export function extractName(answer: string): string | null {
  let s = answer.trim().replace(/[.!?]+$/, '');
  for (const re of NAME_PREFIXES) s = s.replace(re, '');
  s = s.replace(/\s+(hai|hoon|hu|bulao|bula sakte ho|bolo|please|pls)$/i, '').trim();
  const words = s.split(/\s+/).filter(Boolean).slice(0, 3);
  const name = words
    .join(' ')
    .replace(/[^\p{L}\p{M}\s'.-]/gu, '')
    .trim();
  return name && name.length <= 40 ? name : null;
}

function clip(value: string | undefined, max: number): string | null {
  const v = value?.replace(/\s+/g, ' ').trim();
  if (!v) return null;
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

/** Profile from the raw answers (AI_MOCK mode, or when the AI is unavailable). Never invents anything. */
export function heuristicProfile(messages: OnboardingChatMessage[]): Omit<UserProfile, 'updatedAt' | 'status'> {
  const answers = messages.filter((m) => m.role === 'user').map((m) => m.content);
  const style = answers[3]?.toLowerCase() ?? '';
  const tone = /funny|fun|chill|casual|mast|mazak|banter/.test(style)
    ? 'playful'
    : /direct|point|short|straight|seedha|no fluff/.test(style)
      ? 'direct'
      : 'warm';
  return {
    preferredName: answers[0] ? extractName(answers[0]) : null,
    occupation: clip(answers[1], 120),
    currentFocus: clip(answers[2], 240),
    communicationStyle: clip(answers[3], 120),
    languageStyle: detectLanguageStyle(answers),
    tone: answers[3] ? tone : null,
    facts: [],
    summary: null,
  };
}
