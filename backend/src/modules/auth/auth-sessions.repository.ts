import { Injectable } from '@nestjs/common';
import type { AuthSessionRow } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthSessionsStore, NewSession, SubjectType } from './refresh-session.service';

@Injectable()
export class AuthSessionsRepository implements AuthSessionsStore {
  constructor(private readonly prisma: PrismaService) {}

  insert(session: NewSession): Promise<AuthSessionRow> {
    return this.prisma.authSession.create({ data: session });
  }

  findByHash(tokenHash: string): Promise<AuthSessionRow | null> {
    return this.prisma.authSession.findUnique({ where: { tokenHash } });
  }

  rotate(currentId: string, next: NewSession, at: Date): Promise<AuthSessionRow | null> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.authSession.create({ data: next });
      const { count } = await tx.authSession.updateMany({
        where: { id: currentId, revokedAt: null, replacedBy: null },
        data: { revokedAt: at, replacedBy: created.id },
      });
      if (count !== 1) {
        await tx.authSession.delete({ where: { id: created.id } });
        return null;
      }
      return created;
    });
  }

  async revoke(id: string, at: Date): Promise<void> {
    await this.prisma.authSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: at } });
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await this.prisma.authSession.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: at } });
  }

  async revokeAllForSubject(subjectType: SubjectType, subjectId: string, at: Date): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { subjectType, subjectId, revokedAt: null },
      data: { revokedAt: at },
    });
  }
}
