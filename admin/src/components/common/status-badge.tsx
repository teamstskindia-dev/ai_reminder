import { Badge } from '@/components/ui/badge';
import { cn, humanize } from '@/lib/utils';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted' | 'violet';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-secondary text-secondary-foreground',
  muted: 'bg-muted text-muted-foreground',
  info: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  success: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  danger: 'bg-red-500/12 text-red-700 dark:text-red-300',
  violet: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
};

const DOT_CLASSES: Record<Tone, string> = {
  neutral: 'bg-foreground/50',
  muted: 'bg-muted-foreground/60',
  info: 'bg-sky-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  violet: 'bg-violet-500',
};

/** Status strings from every resource mapped to a tone. Unknown values render neutral. */
const STATUS_TONES: Record<string, Tone> = {
  // meetings
  scheduled: 'info',
  joining: 'violet',
  waiting_room: 'warning',
  in_progress: 'violet',
  processing: 'warning',
  completed: 'success',
  failed: 'danger',
  cancelled: 'muted',
  skipped: 'muted',
  // users / admins
  active: 'success',
  suspended: 'danger',
  disabled: 'muted',
  // pages
  draft: 'muted',
  published: 'success',
  // reminders / action items
  pending: 'info',
  sent: 'success',
  open: 'info',
  done: 'success',
  dismissed: 'muted',
  // misc
  paused: 'warning',
  running: 'success',
  inactive: 'muted',
  scheduled_future: 'info',
  expired: 'muted',
  live: 'success',
  connected: 'success',
  disconnected: 'muted',
  positive: 'success',
  neutral: 'neutral',
  negative: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'muted',
  // banner variants
  info: 'info',
  success: 'success',
  warning: 'warning',
  promo: 'violet',
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}

export function StatusBadge({ status, label, tone, dot = true, className }: StatusBadgeProps) {
  const resolved = tone ?? STATUS_TONES[status] ?? 'neutral';
  return (
    <Badge variant="secondary" className={cn('gap-1.5 border-transparent font-medium', TONE_CLASSES[resolved], className)}>
      {dot ? <span aria-hidden className={cn('size-1.5 rounded-full', DOT_CLASSES[resolved])} /> : null}
      {label ?? humanize(status)}
    </Badge>
  );
}
