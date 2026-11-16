/** Mood 1..5 as an emoji (index 0 unused). */
export const MOOD_EMOJI = ['', '😞', '😕', '😐', '🙂', '😄'] as const;

export function moodEmoji(mood: number | null | undefined): string {
  return mood && mood >= 1 && mood <= 5 ? MOOD_EMOJI[mood] : '·';
}
