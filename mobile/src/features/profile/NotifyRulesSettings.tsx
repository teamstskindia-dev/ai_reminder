import { BellOff, Coffee, Focus, Gauge, Mail, ShieldAlert, Star } from 'lucide-react-native';
import { useState } from 'react';

import type { UserSettings } from '@/api/types';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { ListGroup, ListRow, SwitchRow } from '@/components/ui/ListRow';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { useNow } from '@/hooks/useNow';
import { formatDayLabel, formatTime } from '@/utils/format';
import { toast } from '@/utils/toast';

const BUDGETS = [3, 5, 8, 12, 20];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function until(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.getTime() > now ? `Until ${formatDayLabel(d).toLowerCase()} ${formatTime(d)}` : null;
}

/** The next local occurrence of "HH:MM" (for "until tomorrow morning"). */
function nextAt(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 7, m || 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

type Sheet = 'budget' | 'focus' | 'break' | 'vip' | 'muted' | null;

/**
 * How notifications decide (user-flow §09): email alerts, the daily push budget, critical alerts in quiet
 * hours, focus mode, a break from nudges, and the senders that always / never alert.
 */
export function NotifyRulesSettings({ settings, onChange }: { settings: UserSettings; onChange: (patch: Partial<UserSettings>) => void }) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [adding, setAdding] = useState<'vip' | 'muted' | null>(null);
  const now = useNow();
  const focus = until(settings.focusUntil, now);
  const paused = until(settings.nudgesPausedUntil, now);
  const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

  const addSender = (list: 'vip' | 'muted', raw: string) => {
    const value = raw.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      toast('Enter an email address, like name@company.com.');
      return;
    }
    if (list === 'vip') {
      onChange({ vipSenders: [...new Set([...settings.vipSenders, value])], mutedSenders: settings.mutedSenders.filter((s) => s !== value) });
    } else {
      onChange({ mutedSenders: [...new Set([...settings.mutedSenders, value])], vipSenders: settings.vipSenders.filter((s) => s !== value) });
    }
  };

  return (
    <>
      <ListGroup title="How I notify you">
        <SwitchRow
          icon={Mail}
          title="Important email alerts"
          subtitle="Urgent mail and people you always want to hear from. The rest goes into your brief."
          value={settings.emailAlerts}
          onValueChange={(emailAlerts) => onChange({ emailAlerts })}
        />
        <ListRow icon={Star} title="Always alert me" subtitle="Senders that break through quiet hours" value={String(settings.vipSenders.length)} onPress={() => setSheet('vip')} />
        <ListRow icon={BellOff} title="Not important" subtitle="Senders that never alert" value={String(settings.mutedSenders.length)} onPress={() => setSheet('muted')} />
        <ListRow
          icon={Gauge}
          title="Daily push limit"
          subtitle="More than this and I bundle them into one"
          value={`${settings.pushBudget} a day`}
          onPress={() => setSheet('budget')}
        />
        <SwitchRow
          icon={ShieldAlert}
          title="Critical alerts in quiet hours"
          subtitle="Timed reminders, meetings starting and urgent email still come through"
          value={settings.criticalBreakThrough}
          onValueChange={(criticalBreakThrough) => onChange({ criticalBreakThrough })}
        />
        <ListRow icon={Focus} title="Focus mode" subtitle="Hold notifications for a while" value={focus ?? 'Off'} onPress={() => setSheet('focus')} />
        <ListRow
          icon={Coffee}
          title="Take a break"
          subtitle="No briefs, check-ins or nudges. Your reminders still come."
          value={paused ?? 'Off'}
          onPress={() => setSheet('break')}
        />
      </ListGroup>

      <ActionSheet
        visible={sheet === 'budget'}
        title="Pushes per day"
        options={BUDGETS.map((n) => ({
          key: String(n),
          label: `${n} a day${n === settings.pushBudget ? '  ✓' : ''}`,
          onPress: () => onChange({ pushBudget: n }),
        }))}
        onClose={() => setSheet(null)}
      />
      <ActionSheet
        visible={sheet === 'focus'}
        title="Focus mode"
        message="Notifications wait until it ends (critical ones too, unless they may break through)."
        options={[
          { key: '1', label: '1 hour', onPress: () => onChange({ focusUntil: inHours(1) }) },
          { key: '2', label: '2 hours', onPress: () => onChange({ focusUntil: inHours(2) }) },
          { key: '4', label: '4 hours', onPress: () => onChange({ focusUntil: inHours(4) }) },
          { key: 'morning', label: 'Until tomorrow morning', onPress: () => onChange({ focusUntil: nextAt(settings.wakeTime).toISOString() }) },
          ...(focus ? [{ key: 'off', label: 'Turn off', destructive: true, onPress: () => onChange({ focusUntil: null }) }] : []),
        ]}
        onClose={() => setSheet(null)}
      />
      <ActionSheet
        visible={sheet === 'break'}
        title="Take a break"
        message="I'll stay quiet: no morning brief, check-ins or nudges. Reminders you set still come."
        options={[
          { key: '1', label: '1 day', onPress: () => onChange({ nudgesPausedUntil: inHours(24) }) },
          { key: '3', label: '3 days', onPress: () => onChange({ nudgesPausedUntil: inHours(72) }) },
          { key: '7', label: '1 week', onPress: () => onChange({ nudgesPausedUntil: inHours(168) }) },
          ...(paused ? [{ key: 'off', label: 'Resume now', destructive: true, onPress: () => onChange({ nudgesPausedUntil: null }) }] : []),
        ]}
        onClose={() => setSheet(null)}
      />
      <ActionSheet
        visible={sheet === 'vip' || sheet === 'muted'}
        title={sheet === 'vip' ? 'Always alert me' : 'Not important'}
        message={
          (sheet === 'vip' ? settings.vipSenders : settings.mutedSenders).length
            ? 'Tap a sender to remove it.'
            : sheet === 'vip'
              ? 'No one yet. Add a sender, or tap “Always alert me” on an email.'
              : 'No one yet. Tap “Not important” on an email to stop its alerts.'
        }
        options={[
          ...(sheet === 'vip' ? settings.vipSenders : settings.mutedSenders).map((s) => ({
            key: s,
            label: s,
            destructive: true,
            onPress: () =>
              sheet === 'vip'
                ? onChange({ vipSenders: settings.vipSenders.filter((x) => x !== s) })
                : onChange({ mutedSenders: settings.mutedSenders.filter((x) => x !== s) }),
          })),
          { key: '__add', label: 'Add a sender…', onPress: () => setAdding(sheet === 'vip' ? 'vip' : 'muted') },
        ]}
        onClose={() => setSheet(null)}
      />
      <PromptDialog
        visible={adding !== null}
        title={adding === 'vip' ? 'Always alert me about' : 'Never alert me about'}
        initialValue=""
        placeholder="name@company.com"
        maxLength={320}
        confirmLabel="Add"
        onCancel={() => setAdding(null)}
        onSubmit={(value) => {
          if (adding) addSender(adding, value);
          setAdding(null);
        }}
      />
    </>
  );
}
