import {
  BarChart3,
  Bell,
  BellRing,
  CalendarDays,
  Check,
  CircleHelp,
  Clock,
  FileText,
  Globe,
  House,
  ListChecks,
  Mail,
  Mic,
  Search,
  Settings,
  Shield,
  Sparkles,
  User,
  Users,
  Video,
  Zap,
  Circle,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import { createElement } from "react";
import type { IconKey } from "@/lib/api/types";

/** Contract `IconKey` → lucide icon. Unknown keys fall back to a generic icon. */
export const ICONS: Record<IconKey, LucideIcon> = {
  home: House,
  calendar: CalendarDays,
  meetings: Video,
  reports: FileText,
  analytics: BarChart3,
  "action-items": ListChecks,
  reminders: BellRing,
  "ask-ai": Sparkles,
  notifications: Bell,
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
  "file-text": FileText,
  bell: Bell,
  check: Check,
};

export const FALLBACK_ICON: LucideIcon = Circle;

export function getIcon(key: string | null | undefined): LucideIcon {
  if (!key) return FALLBACK_ICON;
  return (ICONS as Record<string, LucideIcon>)[key] ?? FALLBACK_ICON;
}

export function DynamicIcon({ icon, ...props }: { icon: string | null | undefined } & Omit<LucideProps, "ref">) {
  return createElement(getIcon(icon), { "aria-hidden": true, ...props });
}
