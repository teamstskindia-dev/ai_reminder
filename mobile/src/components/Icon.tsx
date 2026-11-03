import {
  Bell,
  CalendarDays,
  ChartColumn,
  Check,
  CircleQuestionMark,
  CircleUser,
  Clock,
  FileText,
  Globe,
  House,
  LayoutGrid,
  ListChecks,
  Mail,
  Mic,
  Search,
  Settings,
  Shield,
  Sparkles,
  Users,
  Video,
  Zap,
  AlarmClock,
  type LucideIcon,
} from 'lucide-react-native';
import { createElement } from 'react';
import type { ColorValue } from 'react-native';

import type { IconKey } from '@/api/types';

/** The single mapping from contract icon keys to lucide-react-native icons. */
const ICONS: Record<IconKey, LucideIcon> = {
  home: House,
  calendar: CalendarDays,
  meetings: Video,
  reports: FileText,
  analytics: ChartColumn,
  'action-items': ListChecks,
  reminders: AlarmClock,
  'ask-ai': Sparkles,
  notifications: Bell,
  settings: Settings,
  profile: CircleUser,
  help: CircleQuestionMark,
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

export const FALLBACK_ICON: LucideIcon = LayoutGrid;

/** Resolves any (possibly unknown) icon key to a lucide icon, falling back to a generic one. */
export function iconFor(key: string | null | undefined): LucideIcon {
  if (key && key in ICONS) return ICONS[key as IconKey];
  return FALLBACK_ICON;
}

export interface IconProps {
  name: string | null | undefined;
  size?: number;
  color: ColorValue;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, color, strokeWidth = 2 }: IconProps) {
  return createElement(iconFor(name), { size, color, strokeWidth });
}
