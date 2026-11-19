import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AppException, causeChain, UpstreamError } from '../../common/errors/app.exception';
import type {
  IntegrationTarget,
  ToolItem,
  ToolProvider,
  ToolTask,
  ToolTaskResult,
  ToolTaskSource,
  ToolTaskStatus,
} from '../../common/types/api.types';
import { sameTitle } from '../../common/utils/similarity.util';
import { localDateString, safeTimeZone } from '../../common/utils/time.util';
import type { ConnectedAccountRow, ToolTaskRow } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { upsertJob } from '../../infra/queue/job-utils';
import { JOB, JobId, QUEUE, ToolTaskRetryJob } from '../../infra/queue/queue.constants';
import { ActionItemsService } from '../action-items/action-items.service';
import type { UpdateActionItemDto } from '../action-items/action-items.dto';
import { atLocalTime } from '../companion/rhythm.util';
import { accountSettings, ConnectionsService, ReconnectRequiredError } from '../connections/connections.service';
import { isToolProvider, PROVIDER_NAME } from '../connections/oauth-providers';
import { ProviderHttpError } from '../connections/provider-http';
import { NotificationProducer } from '../notifications/notification-producer.service';
import { notionCreatePage, TOOL_API, type ToolContext } from './tool-providers';

export interface CreateToolTaskInput {
  provider?: ToolProvider | null;
  actionItemId?: string | null;
  title?: string | null;
  details?: string | null;
  dueAt?: Date | null;
  ownerName?: string | null;
  source: ToolTaskSource;
  /** Create even though a similar open task exists. */
  force?: boolean;
  /** Merge into this existing task instead of creating one. */
  mergeWithExternalId?: string | null;
  /** Called from the auto-send path: the user did not tap Send. */
  auto?: boolean;
}

const MAX_RETRIES = 6;
const WATCH_BATCH = 200;
const WATCH_EVERY_MS = 14 * 60_000;

export function toToolTask(row: ToolTaskRow): ToolTask {
  return {
    id: row.id,
    provider: row.provider as ToolProvider,
    title: row.title,
    externalKey: row.externalKey,
    url: row.url,
    status: row.status as ToolTaskStatus,
    source: row.source as ToolTaskSource,
    actionItemId: row.actionItemId,
    ownerName: row.ownerName,
    dueAt: row.dueAt?.toISOString() ?? null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Notion, Jira and other tools (user-flow §08): action items go where the user's work lives. A task is
 * prepared from a meeting, an email or chat; similar open tasks are offered for merging; it is created in
 * the default project (or waits for Send unless auto-send is on); the to-do in the app is its linked copy;
 * a tool that is down or needs a reconnect keeps the task in the app and retries; and status and due dates
 * are watched so "done there" means done here.
 */
@Injectable()
export class ToolTasksService {
  private readonly logger = new Logger(ToolTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: ConnectionsService,
    private readonly actionItems: ActionItemsService,
    private readonly notifications: NotificationProducer,
    @InjectQueue(QUEUE.INTEGRATIONS) private readonly queue: Queue,
  ) {}

  private ctx(account: ConnectedAccountRow, token: string): ToolContext {
    return { token, settings: accountSettings(account) };
  }

  /** The tool to use: the one named, else the first connected one. */
  async account(userId: string, provider?: ToolProvider | null): Promise<ConnectedAccountRow> {
    if (provider) return this.connections.requireAccount(userId, provider);
    const [first] = await this.connections.toolAccounts(userId);
    if (!first) throw AppException.conflict('Connect Notion, Jira, Linear or Todoist in Connected apps first.');
    return first;
  }

  async targets(userId: string, provider: string): Promise<IntegrationTarget[]> {
    if (!isToolProvider(provider)) throw AppException.notFound('Tool');
    const account = await this.connections.requireAccount(userId, provider);
    return this.connections.withToken(account, (token) => TOOL_API[provider].listTargets(this.ctx(account, token)));
  }

  /** The default project / database; picks (and saves) the first one when none was chosen yet. */
  private async target(account: ConnectedAccountRow): Promise<{ account: ConnectedAccountRow; targetId: string }> {
    const s = accountSettings(account);
    if (typeof s.targetId === 'string' && s.targetId) return { account, targetId: s.targetId };
    const provider = account.provider as ToolProvider;
    const list = await this.connections.withToken(account, (token) =>
      TOOL_API[provider].listTargets(this.ctx(account, token)),
    );
    if (!list.length) {
      throw AppException.conflict(
        provider === 'notion'
          ? 'Share a Notion database with Remi (… menu → Connections), then pick it in Connected apps.'
          : `No ${PROVIDER_NAME[provider]} project found. Pick one in Connected apps.`,
      );
    }
    const saved = await this.connections.saveSettings(account, { targetId: list[0].id, targetName: list[0].name });
    return { account: saved, targetId: list[0].id };
  }

  async list(userId: string, actionItemId?: string): Promise<ToolTask[]> {
    const rows = await this.prisma.toolTask.findMany({
      where: { userId, ...(actionItemId ? { actionItemId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map(toToolTask);
  }

  async create(userId: string, input: CreateToolTaskInput): Promise<ToolTaskResult> {
    const base = await this.account(userId, input.provider);
    const provider = base.provider as ToolProvider;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const tz = safeTimeZone(user?.timezone ?? 'UTC');

    // The to-do in the app is the linked copy.
    let item = input.actionItemId
      ? await this.prisma.actionItem.findFirst({
          where: { id: input.actionItemId, userId },
          include: { meeting: { select: { title: true } } },
        })
      : null;
    if (input.actionItemId && !item) throw AppException.notFound('Action item');
    const title = (input.title?.trim() || item?.title || '').slice(0, 300);
    if (!title) throw AppException.validation([{ field: 'title', messages: ['title should not be empty'] }]);
    if (item) {
      const linked = await this.prisma.toolTask.findFirst({
        where: { actionItemId: item.id, status: { in: ['open', 'pending'] } },
      });
      if (linked) return { outcome: 'linked', task: toToolTask(linked), duplicate: null };
    }
    const dueAt = input.dueAt ?? item?.dueAt ?? null;
    const ownerName = input.ownerName ?? (item && !item.isMine ? item.assigneeName : null);
    const details = input.details ?? item?.description ?? null;

    const { account, targetId } = await this.target(base);

    if (!input.force && !input.mergeWithExternalId) {
      const duplicate = await this.findDuplicate(account, targetId, title);
      if (duplicate) return { outcome: 'duplicate', task: null, duplicate };
    }

    if (!item) {
      const created = await this.actionItems.create(userId, {
        title,
        description: details ?? undefined,
        dueAt: dueAt?.toISOString(),
        remind: Boolean(dueAt && dueAt.getTime() > Date.now() + 60_000),
      });
      item = await this.prisma.actionItem.findUnique({
        where: { id: created.id },
        include: { meeting: { select: { title: true } } },
      });
    }

    if (input.mergeWithExternalId) {
      const merged = await this.prisma.toolTask.create({
        data: {
          userId,
          accountId: account.id,
          provider,
          actionItemId: item?.id ?? null,
          externalId: input.mergeWithExternalId,
          title,
          status: 'open',
          source: input.source,
          dueAt,
        },
      });
      return { outcome: 'linked', task: toToolTask(merged), duplicate: null };
    }

    const row = await this.prisma.toolTask.create({
      data: {
        userId,
        accountId: account.id,
        provider,
        actionItemId: item?.id ?? null,
        title,
        details,
        ownerName,
        status: 'pending',
        source: input.source,
        dueAt,
      },
    });
    const sourceLine = item?.meeting?.title
      ? `From "${item.meeting.title}".`
      : input.source === 'email'
        ? 'From an email.'
        : input.source === 'chat'
          ? 'From a chat with your friend.'
          : null;
    return this.send(row, account, targetId, tz, sourceLine);
  }

  private async findDuplicate(
    account: ConnectedAccountRow,
    targetId: string,
    title: string,
  ): Promise<ToolTaskResult['duplicate']> {
    const provider = account.provider as ToolProvider;
    try {
      const open = await this.connections.withToken(account, (token) =>
        TOOL_API[provider].candidates(this.ctx(account, token), targetId),
      );
      const hit = open.find((o) => sameTitle(o.title, title));
      return hit ? { externalId: hit.id, externalKey: hit.key, title: hit.title, url: hit.url } : null;
    } catch (err) {
      if (err instanceof ReconnectRequiredError) throw err;
      // The duplicate check never blocks creating the task.
      this.logger.warn({ provider, causes: causeChain(err) }, 'duplicate check failed');
      return null;
    }
  }

  /** Creates the task in the tool; on a temporary failure keeps it in the app and retries. */
  private async send(
    row: ToolTaskRow,
    account: ConnectedAccountRow,
    targetId: string,
    tz: string,
    sourceLine: string | null,
  ): Promise<ToolTaskResult> {
    const provider = account.provider as ToolProvider;
    try {
      const created = await this.connections.withToken(account, (token) =>
        TOOL_API[provider].create(this.ctx(account, token), targetId, {
          title: row.title,
          details: row.details,
          dueDate: row.dueAt ? localDateString(row.dueAt, tz) : null,
          ownerName: row.ownerName,
          sourceLine,
        }),
      );
      const updated = await this.prisma.toolTask.update({
        where: { id: row.id },
        data: {
          externalId: created.externalId,
          externalKey: created.externalKey,
          url: created.url,
          status: 'open',
          lastError: null,
          attempts: { increment: 1 },
          lastCheckedAt: new Date(),
        },
      });
      await this.notifications.notify({
        userId: row.userId,
        type: 'task_created',
        templateKey: 'task_created',
        vars: {
          title: `Created in ${PROVIDER_NAME[provider]}${created.externalKey ? ` · ${created.externalKey}` : ''}`,
          body: row.title,
        },
        data: { toolTaskId: row.id, ...(created.url ? { url: created.url } : {}) },
      });
      this.logger.log({ provider, toolTaskId: row.id }, 'task created in tool');
      return { outcome: 'created', task: toToolTask(updated), duplicate: null };
    } catch (err) {
      const temporary =
        err instanceof ReconnectRequiredError || err instanceof UpstreamError || !(err instanceof ProviderHttpError);
      const reason =
        err instanceof ReconnectRequiredError
          ? `Waiting for you to reconnect ${PROVIDER_NAME[provider]}`
          : temporary
            ? `${PROVIDER_NAME[provider]} is not answering; I'll retry`
            : `${PROVIDER_NAME[provider]} refused it (${err.status})`;
      const updated = await this.prisma.toolTask.update({
        where: { id: row.id },
        data: { status: temporary ? 'pending' : 'failed', lastError: reason, attempts: { increment: 1 } },
      });
      this.logger.warn(
        { provider, toolTaskId: row.id, temporary, causes: causeChain(err) },
        'creating task in tool failed',
      );
      if (!temporary) {
        if (err instanceof ProviderHttpError && (err.status === 403 || err.status === 404)) {
          // The default project is gone or not allowed: let the user pick again.
          await this.connections.saveSettings(account, { targetId: null, targetName: null });
        }
        throw AppException.conflict(
          `${PROVIDER_NAME[provider]} didn't accept the task. Check the default project in Connected apps.`,
        );
      }
      await this.scheduleRetry(updated, err instanceof ReconnectRequiredError);
      return { outcome: 'queued', task: toToolTask(updated), duplicate: null };
    }
  }

  private async scheduleRetry(row: ToolTaskRow, waitingForReconnect: boolean): Promise<void> {
    if (row.attempts >= MAX_RETRIES) {
      await this.prisma.toolTask.update({ where: { id: row.id }, data: { status: 'failed' } });
      return;
    }
    const delay = waitingForReconnect ? 3600_000 : Math.min(3600_000, 60_000 * 2 ** row.attempts);
    await upsertJob<ToolTaskRetryJob>(
      this.queue,
      JOB.TOOL_TASK_RETRY,
      { taskId: row.id },
      { jobId: JobId.toolTaskRetry(row.id, row.attempts), delay },
      'keep',
    );
  }

  /** Worker: retries a task the tool could not take. */
  async retry(taskId: string): Promise<'created' | 'queued' | 'skipped'> {
    const row = await this.prisma.toolTask.findUnique({ where: { id: taskId } });
    if (!row || row.status !== 'pending' || !row.accountId) return 'skipped';
    const account = await this.prisma.connectedAccount.findUnique({ where: { id: row.accountId } });
    if (!account) return 'skipped';
    if (account.status !== 'connected') {
      await this.prisma.toolTask.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
      await this.scheduleRetry({ ...row, attempts: row.attempts + 1 }, true);
      return 'queued';
    }
    const user = await this.prisma.user.findUnique({ where: { id: row.userId }, select: { timezone: true } });
    try {
      const { account: acc, targetId } = await this.target(account);
      const res = await this.send(row, acc, targetId, safeTimeZone(user?.timezone ?? 'UTC'), null);
      return res.outcome === 'created' ? 'created' : 'queued';
    } catch (err) {
      this.logger.warn({ toolTaskId: row.id, causes: causeChain(err) }, 'tool task retry failed');
      return 'skipped';
    }
  }

  /** Worker, every 15 minutes: done in the tool → done here; a changed due date moves the reminder. */
  async watch(): Promise<{ checked: number; done: number }> {
    const rows = await this.prisma.toolTask.findMany({
      where: {
        status: 'open',
        externalId: { not: null },
        account: { status: 'connected' },
        OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - WATCH_EVERY_MS) } }],
      },
      include: { account: true, user: { select: { timezone: true } } },
      orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } },
      take: WATCH_BATCH,
    });
    let done = 0;
    for (const row of rows) {
      const account = row.account;
      if (!account || !row.externalId) continue;
      const provider = row.provider as ToolProvider;
      try {
        const state = await this.connections.withToken(account, (token) =>
          TOOL_API[provider].status(this.ctx(account, token), row.externalId as string),
        );
        if (!state) {
          await this.prisma.toolTask.update({
            where: { id: row.id },
            data: { status: 'failed', lastError: `Removed from ${PROVIDER_NAME[provider]}`, lastCheckedAt: new Date() },
          });
          continue;
        }
        const tz = safeTimeZone(row.user.timezone);
        const currentDue = row.dueAt ? localDateString(row.dueAt, tz) : null;
        const dueChanged = state.dueDate !== null && state.dueDate !== currentDue;
        // A date-only due date means "by 6 pm that day" in the user's time zone.
        const newDue = dueChanged ? atLocalTime(state.dueDate as string, tz, '18:00') : null;
        await this.prisma.toolTask.update({
          where: { id: row.id },
          data: {
            lastCheckedAt: new Date(),
            ...(state.done ? { status: 'done' } : {}),
            ...(newDue && !Number.isNaN(newDue.getTime()) ? { dueAt: newDue } : {}),
          },
        });
        if (row.actionItemId) {
          const patch: Partial<UpdateActionItemDto> = {};
          if (state.done) patch.status = 'done';
          else if (newDue && !Number.isNaN(newDue.getTime())) patch.dueAt = newDue.toISOString();
          if (Object.keys(patch).length) {
            await this.actionItems
              .update(row.userId, row.actionItemId, patch as UpdateActionItemDto)
              .catch((err: Error) => this.logger.warn(`could not update linked to-do: ${err.message}`));
          }
        }
        if (state.done) done++;
      } catch (err) {
        await this.prisma.toolTask.update({ where: { id: row.id }, data: { lastCheckedAt: new Date() } });
        if (!(err instanceof ReconnectRequiredError)) {
          this.logger.warn({ provider, causes: causeChain(err) }, 'tool status check failed');
        }
      }
    }
    if (rows.length) this.logger.log({ checked: rows.length, done }, 'tool tasks watched');
    return { checked: rows.length, done };
  }

  /** "What is pending on my Jira?" */
  async listMine(
    userId: string,
    provider?: ToolProvider | null,
  ): Promise<{ provider: ToolProvider; items: ToolItem[] }> {
    const account = await this.account(userId, provider);
    const p = account.provider as ToolProvider;
    const s = accountSettings(account);
    const items = await this.connections.withToken(account, (token) =>
      TOOL_API[p].listMine(this.ctx(account, token), typeof s.targetId === 'string' ? s.targetId : null),
    );
    return { provider: p, items };
  }

  /** "Save this summary to Notion": a page in the default Notion database. */
  async saveNote(userId: string, title: string, body: string): Promise<{ url: string | null }> {
    const account = await this.connections.requireAccount(userId, 'notion');
    const { account: acc, targetId } = await this.target(account);
    const page = await this.connections.withToken(acc, (token) =>
      notionCreatePage(this.ctx(acc, token), targetId, { title, body }),
    );
    return { url: page.url };
  }
}
