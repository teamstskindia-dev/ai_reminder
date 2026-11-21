import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppException } from '../../common/errors/app.exception';
import type { PersonDetail, PersonListItem, PersonPromise } from '../../common/types/api.types';
import type { PersonRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { REDIS, RedisKeys } from '../../infra/redis/redis.constants';
import { insightPeople, MEETING_MEMORY_SELECT, meetingToMemory } from './memory.mapper';
import { cleanName, isGenericSpeaker, isSamePerson, mentions, mergeFacts, stringList } from './memory.util';

interface OpenItem {
  id: string;
  title: string;
  description: string | null;
  assigneeName: string | null;
  isMine: boolean;
  dueAt: Date | null;
  status: string;
}

const MAX_PEOPLE_FACTS = 20;
const MAX_MEETINGS_PER_PERSON = 500;

function promise(i: OpenItem): PersonPromise {
  return { id: i.id, title: i.title, dueAt: i.dueAt?.toISOString() ?? null, status: i.status };
}

/** Promises both ways between the user and a person (open to-dos only). */
export function promisesFor(names: string[], items: OpenItem[]): { iOwe: PersonPromise[]; theyOwe: PersonPromise[] } {
  const iOwe: PersonPromise[] = [];
  const theyOwe: PersonPromise[] = [];
  for (const item of items) {
    if (!item.isMine && isSamePerson(item.assigneeName, names)) theyOwe.push(promise(item));
    else if (item.isMine && names.some((n) => mentions(item.title, n) || mentions(item.description, n))) {
      iOwe.push(promise(item));
    }
  }
  return { iOwe, theyOwe };
}

/**
 * People cards (user-flow §10): who the user talks about or meets, the relationship, key facts, when they
 * last talked and promises both ways. Cards are built from finished recordings and meetings (idempotent);
 * the user can add, fix, merge or forget them.
 */
@Injectable()
export class PeopleService {
  private readonly logger = new Logger(PeopleService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  // ---------------------------------------------------------------- building cards

  /** Adds a finished conversation to the cards of everyone in it (safe to run again). */
  async syncMeeting(meetingId: string): Promise<number> {
    const m = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        userId: true,
        startAt: true,
        status: true,
        participants: { select: { name: true } },
        report: { select: { insights: true } },
        user: { select: { name: true, email: true, profile: { select: { preferredName: true } } } },
      },
    });
    if (!m || m.status !== 'completed') return 0;
    const self = [m.user.name, m.user.profile?.preferredName, m.user.email.split('@')[0]].filter(
      (n): n is string => !!n,
    );
    const found = new Map<string, { name: string; relation: string | null; notes: string[] }>();
    const add = (raw: string, relation: string | null, notes: string[]) => {
      const name = cleanName(raw);
      if (!name || isGenericSpeaker(name) || isSamePerson(name, self)) return;
      const key = name.toLowerCase();
      const prev = found.get(key);
      found.set(key, {
        name: prev?.name ?? name,
        relation: prev?.relation ?? relation,
        notes: [...(prev?.notes ?? []), ...notes],
      });
    };
    for (const p of insightPeople(m.report?.insights)) add(p.name, cleanName(p.relation), stringList(p.notes));
    for (const p of m.participants) add(p.name, null, []);

    for (const entry of found.values()) {
      try {
        await this.addConversation(m.userId, entry, m.id, m.startAt);
      } catch (err) {
        this.logger.warn({ meetingId, err: (err as Error).message }, 'could not update a people card');
      }
    }
    return found.size;
  }

  private async addConversation(
    userId: string,
    entry: { name: string; relation: string | null; notes: string[] },
    meetingId: string,
    at: Date,
  ): Promise<void> {
    const existing = await this.findByName(userId, entry.name);
    if (existing) {
      await this.prisma.person.update({
        where: { id: existing.id },
        data: {
          relationship: existing.relationship ?? entry.relation,
          facts: mergeFacts(stringList(existing.facts), entry.notes, MAX_PEOPLE_FACTS),
          meetingIds: existing.meetingIds.includes(meetingId)
            ? existing.meetingIds
            : [...existing.meetingIds, meetingId].slice(-MAX_MEETINGS_PER_PERSON),
          lastTalkedAt: !existing.lastTalkedAt || existing.lastTalkedAt < at ? at : existing.lastTalkedAt,
        },
      });
      return;
    }
    try {
      await this.prisma.person.create({
        data: {
          userId,
          name: entry.name,
          relationship: entry.relation,
          facts: mergeFacts([], entry.notes, MAX_PEOPLE_FACTS),
          meetingIds: [meetingId],
          lastTalkedAt: at,
        },
      });
    } catch (err) {
      // Created at the same moment by another job (unique name per user): add to that card instead.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.addConversation(userId, entry, meetingId, at);
      }
      throw err;
    }
  }

  /** The card whose name or other spelling matches (case-insensitive). */
  async findByName(userId: string, name: string): Promise<PersonRow | null> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      select id from public.people
       where user_id = ${userId}::uuid
         and (lower(name) = lower(${name}) or lower(${name}) = any (select lower(a) from unnest(aliases) a))
       order by (lower(name) = lower(${name})) desc
       limit 1`);
    return rows[0] ? this.prisma.person.findUnique({ where: { id: rows[0].id } }) : null;
  }

  /** First visit to People: build cards from past conversations once. */
  async rebuildIfEmpty(userId: string): Promise<void> {
    if (await this.prisma.person.count({ where: { userId } })) return;
    if ((await this.redis.set(RedisKeys.peopleRebuilt(userId), '1', 'EX', 7 * 86_400, 'NX')) !== 'OK') return;
    const meetings = await this.prisma.meeting.findMany({
      where: { userId, status: 'completed', report: { isNot: null } },
      orderBy: { startAt: 'asc' },
      take: 300,
      select: { id: true },
    });
    for (const m of meetings) await this.syncMeeting(m.id);
  }

  // ---------------------------------------------------------------- reading

  private openItems(userId: string): Promise<OpenItem[]> {
    return this.prisma.actionItem.findMany({
      where: { userId, status: 'open' },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 500,
      select: { id: true, title: true, description: true, assigneeName: true, isMine: true, dueAt: true, status: true },
    });
  }

  /** Existing meeting ids among the given ones (deleted conversations drop out of the count). */
  private async liveMeetingIds(userId: string, ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = await this.prisma.meeting.findMany({ where: { userId, id: { in: ids } }, select: { id: true } });
    return new Set(rows.map((r) => r.id));
  }

  async list(userId: string, q?: string): Promise<PersonListItem[]> {
    await this.rebuildIfEmpty(userId);
    const term = q?.trim();
    const people = await this.prisma.person.findMany({
      where: {
        userId,
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { relationship: { contains: term, mode: 'insensitive' } },
                { aliases: { has: term } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastTalkedAt: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
      take: 300,
    });
    const [items, live] = await Promise.all([
      this.openItems(userId),
      this.liveMeetingIds(
        userId,
        people.flatMap((p) => p.meetingIds),
      ),
    ]);
    return people.map((p) => {
      const promises = promisesFor([p.name, ...p.aliases], items);
      return {
        id: p.id,
        name: p.name,
        relationship: p.relationship,
        lastTalkedAt: p.lastTalkedAt?.toISOString() ?? null,
        conversationCount: p.meetingIds.filter((id) => live.has(id)).length,
        openPromises: promises.iOwe.length + promises.theyOwe.length,
      };
    });
  }

  async require(userId: string, id: string): Promise<PersonRow> {
    const p = await this.prisma.person.findFirst({ where: { id, userId } });
    if (!p) throw AppException.notFound('Person');
    return p;
  }

  async get(userId: string, id: string): Promise<PersonDetail> {
    const p = await this.require(userId, id);
    const [items, meetings] = await Promise.all([
      this.openItems(userId),
      this.prisma.meeting.findMany({
        where: { userId, id: { in: p.meetingIds } },
        orderBy: { startAt: 'desc' },
        take: 50,
        select: MEETING_MEMORY_SELECT,
      }),
    ]);
    const promises = promisesFor([p.name, ...p.aliases], items);
    const count = (await this.liveMeetingIds(userId, p.meetingIds)).size;
    return {
      id: p.id,
      name: p.name,
      relationship: p.relationship,
      lastTalkedAt: p.lastTalkedAt?.toISOString() ?? null,
      conversationCount: count,
      openPromises: promises.iOwe.length + promises.theyOwe.length,
      facts: stringList(p.facts),
      aliases: p.aliases,
      promises,
      conversations: meetings.map(meetingToMemory),
    };
  }

  // ---------------------------------------------------------------- editing

  async create(
    userId: string,
    dto: { name: string; relationship?: string | null; facts?: string[] },
  ): Promise<PersonDetail> {
    const name = cleanName(dto.name);
    if (!name) throw AppException.badRequest('A name is required');
    if (await this.findByName(userId, name)) throw AppException.conflict(`You already have a card for ${name}.`);
    const p = await this.prisma.person.create({
      data: {
        userId,
        name,
        relationship: cleanName(dto.relationship) ?? null,
        facts: mergeFacts([], dto.facts ?? [], MAX_PEOPLE_FACTS),
      },
    });
    return this.get(userId, p.id);
  }

  /** Relationship and facts (a new name goes through NameFixService so it is fixed everywhere). */
  async updateDetails(
    userId: string,
    id: string,
    dto: { relationship?: string | null; facts?: string[] },
  ): Promise<PersonRow> {
    await this.require(userId, id);
    return this.prisma.person.update({
      where: { id },
      data: {
        ...(dto.relationship !== undefined ? { relationship: cleanName(dto.relationship) } : {}),
        ...(dto.facts !== undefined ? { facts: mergeFacts([], dto.facts, MAX_PEOPLE_FACTS) } : {}),
      },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.require(userId, id);
    await this.prisma.person.delete({ where: { id } });
  }

  /**
   * After a name fix "from → to": the card for `from` becomes `to` (or merges into an existing `to` card),
   * and `from` is kept as another spelling so future mentions land on the same card.
   */
  async renameCard(userId: string, from: string, to: string): Promise<PersonRow | null> {
    const a = await this.findByName(userId, from);
    const b = await this.findByName(userId, to);
    if (a && b && a.id !== b.id) return this.merge(a, b);
    if (a) {
      const aliases = [...new Set([...a.aliases, ...(a.name.toLowerCase() === to.toLowerCase() ? [] : [a.name])])]
        .filter((n) => n.toLowerCase() !== to.toLowerCase())
        .slice(-20);
      return this.prisma.person.update({ where: { id: a.id }, data: { name: to, aliases } });
    }
    if (
      b &&
      !b.aliases.some((n) => n.toLowerCase() === from.toLowerCase()) &&
      b.name.toLowerCase() !== from.toLowerCase()
    ) {
      return this.prisma.person.update({ where: { id: b.id }, data: { aliases: [...b.aliases, from].slice(-20) } });
    }
    return b;
  }

  /** Folds card `a` into card `b` (facts, other spellings, conversations) and deletes `a`. */
  private async merge(a: PersonRow, b: PersonRow): Promise<PersonRow> {
    const aliases = [...new Set([...b.aliases, ...a.aliases, a.name])]
      .filter((n) => n.toLowerCase() !== b.name.toLowerCase())
      .slice(-20);
    const lastTalkedAt =
      a.lastTalkedAt && (!b.lastTalkedAt || a.lastTalkedAt > b.lastTalkedAt) ? a.lastTalkedAt : b.lastTalkedAt;
    const [, merged] = await this.prisma.$transaction([
      this.prisma.person.delete({ where: { id: a.id } }),
      this.prisma.person.update({
        where: { id: b.id },
        data: {
          relationship: b.relationship ?? a.relationship,
          facts: mergeFacts(stringList(a.facts), stringList(b.facts), MAX_PEOPLE_FACTS),
          aliases,
          meetingIds: [...new Set([...a.meetingIds, ...b.meetingIds])].slice(-MAX_MEETINGS_PER_PERSON),
          lastTalkedAt,
        },
      }),
    ]);
    return merged;
  }
}
