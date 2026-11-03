import { Injectable } from '@nestjs/common';
import type { AdminRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class AdminsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<AdminRow | null> {
    return this.prisma.admin.findUnique({ where: { id } });
  }

  /** Case-insensitive (matches the `lower(email)` unique index). */
  findByEmail(email: string): Promise<AdminRow | null> {
    return this.prisma.admin.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
  }

  list(): Promise<AdminRow[]> {
    return this.prisma.admin.findMany({ orderBy: { createdAt: 'asc' } });
  }

  count(): Promise<number> {
    return this.prisma.admin.count();
  }

  create(data: Prisma.AdminCreateInput): Promise<AdminRow> {
    return this.prisma.admin.create({ data });
  }

  update(id: string, data: Prisma.AdminUpdateInput): Promise<AdminRow> {
    return this.prisma.admin.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.admin.delete({ where: { id } });
  }
}
