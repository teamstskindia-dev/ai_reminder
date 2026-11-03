'use client';

import {
  AlarmClock,
  BarChart3,
  Bell,
  BellRing,
  Calendar,
  Check,
  CircleHelp,
  Clock,
  FileBarChart,
  FileText,
  Globe,
  House,
  ListChecks,
  Mail,
  MessageSquareText,
  Mic,
  Search,
  Settings,
  Shield,
  Sparkles,
  Square,
  User,
  Users,
  Video,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { createElement } from 'react';
import type { FieldPath, FieldValues } from 'react-hook-form';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ICON_KEYS, type IconKey } from '@/lib/api/types';
import { cn, humanize } from '@/lib/utils';

import { FormField, type BaseFieldProps } from './fields';

/** Contract IconKey → lucide icon (mirrors what web/mobile render). */
export const ICON_MAP: Record<IconKey, LucideIcon> = {
  home: House,
  calendar: Calendar,
  meetings: Video,
  reports: FileBarChart,
  analytics: BarChart3,
  'action-items': ListChecks,
  reminders: AlarmClock,
  'ask-ai': MessageSquareText,
  notifications: BellRing,
  settings: Settings,
  profile: User,
  help: CircleHelp,
  sparkles: Sparkles,
  mic: Mic,
  shield: Shield,
  zap: Zap,
  clock: Clock,
  search: Search,
  mail: Mail,
  globe: Globe,
  users: Users,
  'file-text': FileText,
  bell: Bell,
  check: Check,
};

export function iconFor(key: string | null | undefined): LucideIcon {
  return (key && ICON_MAP[key as IconKey]) || Square;
}

export function IconPreview({ icon, className }: { icon: string | null | undefined; className?: string }) {
  return createElement(iconFor(icon), { className: cn('size-4', className), 'aria-hidden': true });
}

const NONE = '__none__';

interface IconSelectProps {
  id?: string;
  value: IconKey | null;
  onChange: (value: IconKey | null) => void;
  onBlur?: () => void;
  nullable?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Select over the contract IconKeys with lucide previews. */
export function IconSelect({ id, value, onChange, onBlur, nullable, disabled, className, ...aria }: IconSelectProps) {
  return (
    <Select
      value={value ?? (nullable ? NONE : undefined)}
      disabled={disabled}
      onValueChange={(v) => onChange(v === NONE ? null : (v as IconKey))}
    >
      <SelectTrigger id={id} onBlur={onBlur} className={cn('w-full', className)} {...aria}>
        <SelectValue placeholder="Choose an icon" />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {nullable ? (
          <SelectItem value={NONE}>
            <span className="text-muted-foreground">No icon</span>
          </SelectItem>
        ) : null}
        {ICON_KEYS.map((key) => {
          const Icon = ICON_MAP[key];
          return (
            <SelectItem key={key} value={key}>
              <Icon aria-hidden />
              <span>{humanize(key)}</span>
              <span className="ml-auto font-mono text-xs text-muted-foreground">{key}</span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

export function IconField<T extends FieldValues, N extends FieldPath<T>, TT extends FieldValues = T>({
  nullable,
  ...props
}: BaseFieldProps<T, N, TT> & { nullable?: boolean }) {
  return (
    <FormField
      {...props}
      render={({ field, id, aria }) => (
        <IconSelect
          id={id}
          value={(field.value as IconKey | null) ?? null}
          onChange={field.onChange}
          onBlur={field.onBlur}
          nullable={nullable}
          disabled={field.disabled}
          {...aria}
        />
      )}
    />
  );
}
