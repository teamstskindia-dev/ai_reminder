import type { AppNotification, NotificationTemplate, NotificationType } from '../../common/types/api.types';
import type { NotificationRow, NotificationTemplateRow } from '../../infra/prisma/models';
import { normalizeChannels } from '../reminders/reminders.mapper';

export function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    data: row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data : {},
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTemplate(row: NotificationTemplateRow): NotificationTemplate {
  return {
    key: row.key,
    name: row.name,
    titleTemplate: row.titleTemplate,
    bodyTemplate: row.bodyTemplate,
    emailSubject: row.emailSubject,
    emailBody: row.emailBody,
    channels: normalizeChannels(row.channels),
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}
