import { useState } from 'react';
import { Share } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { useFixName, useUpdateSummary, useUpdateTranscriptLine } from '@/api/hooks/memory';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { haptics } from '@/utils/haptics';
import { toast } from '@/utils/toast';

/** Speaker labels that are not a real name: fixed in this conversation only. */
const GENERIC = /^(speaker\s*\d*|unknown|unidentified|me|you|guest\s*\d*|person\s*\d*)$/i;

function plain(markdown: string): string {
  return markdown
    .replace(/[*_`#>]+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** "Share summary" (user-flow §10): WhatsApp, email or copy through the system share sheet. */
export async function shareSummary(c: {
  title: string;
  at: string;
  summary: string | null;
  keyPoints?: string[];
  todos?: string[];
}): Promise<void> {
  const date = new Date(c.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const parts = [
    `${c.title} (${date})`,
    c.summary ? plain(c.summary) : null,
    c.keyPoints?.length ? `Key points:\n${c.keyPoints.map((p) => `• ${p}`).join('\n')}` : null,
    c.todos?.length ? `To-dos:\n${c.todos.map((t) => `• ${t}`).join('\n')}` : null,
  ].filter(Boolean);
  try {
    await Share.share({ title: c.title, message: parts.join('\n\n') });
  } catch {
    toast('Couldn’t open sharing.');
  }
}

/**
 * Fixing what the friend got wrong in a conversation (user-flow §10): a speaker or misheard name (fixed
 * everywhere and remembered next time), the summary, or one transcript line.
 */
export function useConversationFixes(conversationId: string) {
  const fixName = useFixName(conversationId);
  const updateSummary = useUpdateSummary(conversationId);
  const updateLine = useUpdateTranscriptLine(conversationId);
  const [nameFrom, setNameFrom] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [line, setLine] = useState<{ seq: number; text: string } | null>(null);
  const generic = nameFrom ? GENERIC.test(nameFrom.trim()) : false;

  const dialogs = (
    <>
      <PromptDialog
        visible={nameFrom !== null}
        title={generic ? `Who is ${nameFrom}?` : `Fix “${nameFrom}”`}
        message={
          generic
            ? 'I’ll name them in this conversation and add them to your people.'
            : 'I’ll fix it everywhere (transcripts, summaries, to-dos, their card) and use it next time.'
        }
        initialValue={generic ? '' : (nameFrom ?? '')}
        placeholder="Name"
        maxLength={120}
        onCancel={() => setNameFrom(null)}
        onSubmit={(value) => {
          const from = nameFrom;
          setNameFrom(null);
          const to = value.trim();
          if (!from || !to || to === from) return;
          fixName.mutate(
            { from, to },
            {
              onSuccess: (res) => {
                haptics.success();
                toast(
                  res.conversations > 1
                    ? `Fixed in ${res.conversations} conversations. I’ll remember ${to}.`
                    : res.remembered
                      ? `Fixed. I’ll remember ${to}.`
                      : `Fixed: ${to}`,
                );
              },
              onError: (e) => toast(getErrorMessage(e)),
            },
          );
        }}
      />
      <PromptDialog
        visible={summary !== null}
        title="Fix the summary"
        initialValue={summary ?? ''}
        maxLength={20_000}
        multiline
        onCancel={() => setSummary(null)}
        onSubmit={(value) => {
          setSummary(null);
          if (value.trim()) updateSummary.mutate(value.trim(), { onError: (e) => toast(getErrorMessage(e)) });
        }}
      />
      <PromptDialog
        visible={line !== null}
        title="Fix this line"
        initialValue={line?.text ?? ''}
        maxLength={5000}
        multiline
        onCancel={() => setLine(null)}
        onSubmit={(value) => {
          const current = line;
          setLine(null);
          if (current && value.trim() && value.trim() !== current.text) {
            updateLine.mutate({ seq: current.seq, text: value.trim() }, { onError: (e) => toast(getErrorMessage(e)) });
          }
        }}
      />
    </>
  );

  return {
    fixName: (from: string) => setNameFrom(from),
    editSummary: (text: string) => setSummary(text),
    editLine: (seq: number, text: string) => setLine({ seq, text }),
    dialogs,
    busy: fixName.isPending || updateSummary.isPending,
  };
}
