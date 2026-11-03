import type { AdminRole, SettingKey } from '@/lib/api/types';

export const ROLE_RANK: Record<AdminRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  super_admin: 3,
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super admin',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  super_admin: 'Everything, including admin accounts and deleting users',
  admin: 'Operations, users, meetings, plans, AI, bot, notifications and system',
  editor: 'Content: sections, pages, navigation, banners, media, branding, theme and SEO',
  viewer: 'Read-only access to every screen',
};

/** True when `role` is at least `min` in the hierarchy super_admin > admin > editor > viewer. */
export function hasRole(role: AdminRole | null | undefined, min: AdminRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** PUT /admin/settings/:key — editor for branding/theme/seo, admin for everything else. */
export function settingEditRole(key: SettingKey): AdminRole {
  return key === 'branding' || key === 'theme' || key === 'seo' ? 'editor' : 'admin';
}
