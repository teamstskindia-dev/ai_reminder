import {
  Activity,
  BrainCircuit,
  Bot,
  CreditCard,
  Flag,
  Image as ImageIcon,
  LayoutDashboard,
  LayoutTemplate,
  Megaphone,
  Bell,
  Navigation,
  Palette,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  FileText,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react';

import type { AdminRole } from '@/lib/api/types';

export interface NavEntry {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Hide the entry from admins below this role (GET access rules from the contract). */
  minRole?: AdminRole;
  /** Extra path prefixes that should mark this entry active. */
  match?: string[];
}

export interface NavGroup {
  label: string;
  items: NavEntry[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ title: 'Dashboard', href: '/', icon: LayoutDashboard }],
  },
  {
    label: 'People & data',
    items: [
      { title: 'Users', href: '/users', icon: Users },
      { title: 'Meetings', href: '/meetings', icon: Video },
    ],
  },
  {
    label: 'Content',
    items: [
      { title: 'Landing & sections', href: '/content/sections', icon: LayoutTemplate },
      { title: 'Pages', href: '/content/pages', icon: FileText },
      { title: 'Navigation', href: '/content/navigation', icon: Navigation },
      { title: 'Banners', href: '/content/banners', icon: Megaphone },
      { title: 'Plans', href: '/content/plans', icon: CreditCard },
      { title: 'Media library', href: '/content/media', icon: ImageIcon },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { title: 'Branding', href: '/settings/branding', icon: Sparkles },
      { title: 'Theme', href: '/settings/theme', icon: Palette },
      { title: 'Features & app', href: '/settings/features', icon: Flag },
      { title: 'SEO', href: '/settings/seo', icon: Search },
      { title: 'AI', href: '/ai', icon: BrainCircuit },
      { title: 'Meeting bot', href: '/bot', icon: Bot },
      { title: 'Notifications', href: '/notifications', icon: Bell },
    ],
  },
  {
    label: 'System',
    items: [
      { title: 'Queues', href: '/system/queues', icon: Activity },
      { title: 'Audit logs', href: '/system/audit-logs', icon: ScrollText, minRole: 'admin' },
      { title: 'Admins', href: '/system/admins', icon: ShieldCheck, minRole: 'super_admin' },
    ],
  },
];

/** Breadcrumb labels for static path segments. */
export const SEGMENT_LABELS: Record<string, string> = {
  users: 'Users',
  meetings: 'Meetings',
  content: 'Content',
  sections: 'Landing & sections',
  pages: 'Pages',
  navigation: 'Navigation',
  banners: 'Banners',
  plans: 'Plans',
  media: 'Media library',
  settings: 'Settings',
  branding: 'Branding',
  theme: 'Theme',
  features: 'Features & app',
  seo: 'SEO',
  ai: 'AI',
  prompts: 'Prompts',
  playground: 'Playground',
  bot: 'Meeting bot',
  notifications: 'Notifications',
  templates: 'Templates',
  broadcasts: 'Broadcasts',
  system: 'System',
  queues: 'Queues',
  'audit-logs': 'Audit logs',
  admins: 'Admins',
  profile: 'Profile',
  new: 'New',
};

/** Segments that are only grouping prefixes and have no page of their own. */
export const NON_LINK_SEGMENTS = new Set(['content', 'settings', 'system']);

export function isNavActive(pathname: string, entry: NavEntry): boolean {
  if (entry.href === '/') return pathname === '/';
  const prefixes = [entry.href, ...(entry.match ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
