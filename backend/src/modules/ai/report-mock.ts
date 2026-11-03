/**
 * Deterministic fake report for AI_MOCK=true, derived from the transcript text so the whole
 * pipeline (action items, reminders, analytics, Ask AI) is testable without a Gemini key.
 */
export function buildMockReport(lines: string[], now: Date): Record<string, unknown> {
  const texts = lines.map((l) => l.replace(/^\[[\d:]+\]\s*/, ''));
  const speakers = [...new Set(texts.map((t) => t.split(':')[0]?.trim()).filter(Boolean))];
  const spoken = texts.map((t) => t.split(':').slice(1).join(':'));
  const words =
    spoken
      .join(' ')
      .toLowerCase()
      .match(/[a-z]{5,}/g) ?? [];
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  const topics = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([w]) => w);
  const commitments = texts.filter((t) => /\b(i'll|i will|we'll|let me|i can)\b/i.test(t)).slice(0, 5);
  const tomorrow9 = new Date(now.getTime() + 24 * 3600_000);
  tomorrow9.setUTCHours(9, 0, 0, 0);
  const inThreeDays = new Date(now.getTime() + 3 * 24 * 3600_000);

  return {
    summary: texts.length
      ? `Mock summary: ${speakers.length} participant(s) discussed ${topics.join(', ') || 'several topics'}. ${texts.length} transcript lines were analysed.`
      : 'The transcript was empty, so there is nothing to summarise.',
    keyPoints: texts.slice(0, 3).map((t) => t.slice(0, 160)),
    chapters: texts.length ? [{ title: 'Discussion', summary: 'Main discussion of the meeting.', startMs: 0 }] : [],
    keyQuestions: texts
      .filter((t) => t.includes('?'))
      .slice(0, 3)
      .map((q) => ({ question: q.slice(0, 200), answer: null, askedBy: q.split(':')[0]?.trim() || null })),
    decisions: texts
      .filter((t) => /\b(decided|agree|agreed|let's go with)\b/i.test(t))
      .slice(0, 3)
      .map((t) => t.slice(0, 200)),
    topics,
    actionItems: commitments.map((c, i) => ({
      title: c.split(':').slice(1).join(':').trim().slice(0, 80) || `Follow up ${i + 1}`,
      description: null,
      assigneeName: c.split(':')[0]?.trim() || null,
      isMine: i === 0,
      dueAt: i === 0 ? inThreeDays.toISOString() : null,
      priority: i === 0 ? 'high' : 'medium',
    })),
    reminders: commitments.length
      ? [
          {
            title: 'Follow up on meeting commitments',
            body: commitments[0].slice(0, 200),
            remindAt: tomorrow9.toISOString(),
          },
        ]
      : [],
    sentimentScore: 70,
    sentimentLabel: 'positive',
    engagementScore: Math.min(100, 40 + speakers.length * 15),
    meetingScore: Math.min(100, 50 + commitments.length * 8),
  };
}
