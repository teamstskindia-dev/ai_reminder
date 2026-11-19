import type { EmailCategory, EmailDetail, EmailItem, EmailProvider, EmailStatus } from '../../common/types/api.types';
import type { EmailMessageRow } from '../../infra/prisma/models';
import { webUrl } from './email-providers';
import { senderMatches, toDetected } from './email.util';

export type EmailWithAccount = EmailMessageRow & {
  account: { provider: string; accountLabel: string | null; settings: unknown };
};

export const EMAIL_INCLUDE = { account: { select: { provider: true, accountLabel: true, settings: true } } } as const;

export function toEmailItem(row: EmailWithAccount, vip: string[]): EmailItem {
  const detected = toDetected(row.detected);
  return {
    id: row.id,
    provider: row.account.provider as EmailProvider,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    subject: row.category === 'sensitive' ? null : row.subject,
    summary: row.category === 'sensitive' ? null : row.summary,
    why: row.why,
    category: row.category as EmailCategory,
    status: row.status as EmailStatus,
    receivedAt: row.receivedAt.toISOString(),
    openDetected: detected.filter((d) => d.status === 'open').length,
    isVip: senderMatches(vip, row.fromEmail),
  };
}

export function toEmailDetail(row: EmailWithAccount, vip: string[]): EmailDetail {
  const settings = (row.account.settings ?? {}) as { canSend?: unknown };
  const provider = row.account.provider as EmailProvider;
  return {
    ...toEmailItem(row, vip),
    detected: toDetected(row.detected),
    reminderId: row.reminderId,
    canSend: settings.canSend === true,
    accountEmail: row.account.accountLabel,
    webUrl: webUrl(provider, row.providerMessageId),
  };
}
