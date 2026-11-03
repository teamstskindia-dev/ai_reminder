import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/pagination/pagination';
import type {
  ActionItem,
  AuditLog,
  Broadcast,
  BroadcastAudience,
  MeetingReport,
  NotificationTemplate,
} from '../../common/types/api.types';
import { splitSpeaker } from '../meetings/transcript-parser';
import { Prisma } from '../../infra/prisma/models';
import type { BroadcastRow } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { addJob } from '../../infra/queue/job-utils';
import { BroadcastJob, JOB, JobId, QUEUE } from '../../infra/queue/queue.constants';
import { toAiPrompt, PromptsRepository } from '../ai/prompts.repository';
import { ReportGeneratorService } from '../ai/report-generator.service';
import { ContentCacheService } from '../content/content-cache.service';
import { toTemplate } from '../notifications/notifications.mapper';
import { TemplatesRepository } from '../notifications/notifications.repository';
import { normalizeChannels } from '../reminders/reminders.mapper';
import { AuditLogsQueryDto, CreateBroadcastDto, PutPromptDto, PutTemplateDto } from './dto/admin.dto';

const KNOWN_PROMPTS = new Set(['meeting_report', 'assistant_answer', 'audio_transcription']);

function toBroadcast(row: BroadcastRow & { creator?: { id: string; name: string } | null }): Broadcast {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    channels: normalizeChannels(row.channels),
    audience: row.audience as unknown as BroadcastAudience,
    sentCount: row.sentCount,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.creator ? { id: row.creator.id, name: row.creator.name } : null,
  };
}

@Injectable()
export class AdminMiscService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prompts: PromptsRepository,
    private readonly generator: ReportGeneratorService,
    private readonly templates: TemplatesRepository,
    private readonly cache: ContentCacheService,
    @InjectQueue(QUEUE.NOTIFICATIONS) private readonly notifications: Queue,
  ) {}

  // ---------- AI ----------
  listPrompts() {
    return this.prisma.aiPrompt.findMany({ orderBy: { key: 'asc' } }).then((rows) => rows.map(toAiPrompt));
  }

  async putPrompt(key: string, dto: PutPromptDto, adminId: string) {
    if (!KNOWN_PROMPTS.has(key)) throw AppException.notFound('Prompt');
    const exists = await this.prisma.aiPrompt.findUnique({ where: { key }, select: { key: true } });
    if (!exists) throw AppException.notFound('Prompt');
    const row = await this.prompts.update(key, dto, adminId);
    await this.cache.invalidate('prompts');
    return toAiPrompt(row);
  }

  /** Runs the meeting_report prompt on a pasted transcript without saving anything. */
  async testReport(transcript: string, title?: string) {
    const lines = transcript
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 20_000);
    const started = Date.now();
    const speakers = [
      ...new Set(lines.map((l) => splitSpeaker(l.replace(/^\[[\d:]+\]\s*/, '')).speaker).filter(Boolean)),
    ] as string[];
    const generated = await this.generator.generate({
      lines,
      meetingTitle: title?.trim() || 'Test meeting',
      meetingStart: new Date(),
      attendees: speakers,
      userName: 'Test User',
      userEmail: 'test@example.com',
      timezone: 'UTC',
    });
    const o = generated.output;
    const report: MeetingReport = {
      summary: o.summary,
      keyPoints: o.keyPoints,
      chapters: o.chapters,
      keyQuestions: o.keyQuestions,
      decisions: o.decisions,
      topics: o.topics,
      meetingScore: o.meetingScore,
      engagementScore: o.engagementScore,
      sentimentScore: o.sentimentScore,
      sentimentLabel: o.sentimentLabel,
      model: generated.model,
      createdAt: new Date().toISOString(),
    };
    const actionItems: Partial<ActionItem>[] = o.actionItems.map((a) => ({
      title: a.title,
      description: a.description,
      assigneeName: a.assigneeName,
      isMine: a.isMine,
      dueAt: a.dueAt,
      priority: a.priority,
      source: 'ai',
    }));
    const reminders = o.reminders
      .filter((r) => r.remindAt)
      .map((r) => ({ title: r.title, remindAt: r.remindAt as string }));
    return { report, actionItems, reminders, latencyMs: Date.now() - started };
  }

  // ---------- notification templates ----------
  async listTemplates(): Promise<NotificationTemplate[]> {
    return (await this.prisma.notificationTemplate.findMany({ orderBy: { key: 'asc' } })).map(toTemplate);
  }

  async putTemplate(key: string, dto: PutTemplateDto, adminId: string): Promise<NotificationTemplate> {
    const exists = await this.templates.findFresh(key);
    if (!exists) throw AppException.notFound('Template');
    const row = await this.templates.update(key, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      titleTemplate: dto.titleTemplate,
      bodyTemplate: dto.bodyTemplate,
      ...(dto.emailSubject !== undefined ? { emailSubject: dto.emailSubject } : {}),
      ...(dto.emailBody !== undefined ? { emailBody: dto.emailBody } : {}),
      channels: dto.channels,
      isActive: dto.isActive,
      updatedBy: adminId,
    });
    await this.cache.invalidate('templates');
    return toTemplate(row);
  }

  // ---------- broadcasts ----------
  async listBroadcasts(page: number, limit: number): Promise<Paginated<Broadcast>> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.broadcast.findMany({
        include: { creator: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.broadcast.count(),
    ]);
    return Paginated.of(rows.map(toBroadcast), total, page, limit);
  }

  async createBroadcast(dto: CreateBroadcastDto, adminId: string): Promise<Broadcast> {
    let audience: BroadcastAudience;
    if (dto.audience.type === 'users') {
      if (!dto.audience.userIds?.length)
        throw AppException.validation([{ field: 'audience.userIds', messages: ['userIds are required'] }]);
      audience = { type: 'users', userIds: dto.audience.userIds };
    } else if (dto.audience.type === 'plan') {
      if (!dto.audience.planId)
        throw AppException.validation([{ field: 'audience.planId', messages: ['planId is required'] }]);
      const plan = await this.prisma.plan.findUnique({ where: { id: dto.audience.planId }, select: { id: true } });
      if (!plan) throw AppException.notFound('Plan');
      audience = { type: 'plan', planId: dto.audience.planId };
    } else {
      audience = { type: 'all' };
    }
    const row = await this.prisma.broadcast.create({
      data: {
        title: dto.title.trim(),
        body: dto.body,
        channels: dto.channels,
        audience: { ...audience },
        data: (dto.data ?? {}) as Prisma.InputJsonValue,
        createdBy: adminId,
      },
      include: { creator: { select: { id: true, name: true } } },
    });
    await addJob<BroadcastJob>(
      this.notifications,
      JOB.BROADCAST,
      { broadcastId: row.id },
      { jobId: JobId.broadcast(row.id) },
    );
    return toBroadcast(row);
  }

  // ---------- audit ----------
  async auditLogs(q: AuditLogsQueryDto): Promise<Paginated<AuditLog>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.adminId ? { adminId: q.adminId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { admin: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return Paginated.of(
      rows.map((r) => ({
        id: Number(r.id),
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        changes: r.changes,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
        admin: r.admin,
      })),
      total,
      q.page,
      q.limit,
    );
  }
}
