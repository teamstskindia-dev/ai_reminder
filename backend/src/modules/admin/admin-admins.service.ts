import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import type { AdminUser } from '../../common/types/api.types';
import type { AdminRow } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AdminsRepository } from '../auth/admins.repository';
import { AdminAuthService, hashPassword, toAdminUser } from './admin-auth.service';
import { CreateAdminDto, UpdateAdminDto } from './dto/admin.dto';

/** Super-admin management of admin accounts, with last-super-admin and self-protection rules. */
@Injectable()
export class AdminAdminsService {
  constructor(
    private readonly admins: AdminsRepository,
    private readonly auth: AdminAuthService,
    private readonly prisma: PrismaService,
  ) {}

  async list(): Promise<AdminUser[]> {
    return (await this.admins.list()).map(toAdminUser);
  }

  async create(dto: CreateAdminDto): Promise<AdminUser> {
    const email = dto.email.trim().toLowerCase();
    if (await this.admins.findByEmail(email)) throw AppException.conflict('An admin with this email already exists');
    const row = await this.admins.create({
      email,
      name: dto.name.trim(),
      role: dto.role,
      passwordHash: await hashPassword(dto.password),
    });
    return toAdminUser(row);
  }

  private async otherActiveSuperAdmins(excludeId: string): Promise<number> {
    return this.prisma.admin.count({ where: { role: 'super_admin', status: 'active', id: { not: excludeId } } });
  }

  async update(actor: AdminRow, id: string, dto: UpdateAdminDto): Promise<AdminUser> {
    const target = await this.admins.findById(id);
    if (!target) throw AppException.notFound('Admin');
    const demoting = dto.role !== undefined && dto.role !== 'super_admin' && target.role === 'super_admin';
    const disabling = dto.status === 'disabled' && target.status === 'active';
    if ((demoting || disabling) && target.role === 'super_admin' && (await this.otherActiveSuperAdmins(id)) === 0) {
      throw AppException.conflict('The last active super admin cannot be demoted or disabled');
    }
    if (actor.id === id && (disabling || demoting))
      throw AppException.conflict('You cannot disable or demote yourself');
    const row = await this.admins.update(id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.role !== undefined ? { role: dto.role } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.password !== undefined ? { passwordHash: await hashPassword(dto.password) } : {}),
    });
    const roleChanged = dto.role !== undefined && dto.role !== target.role;
    if (roleChanged || disabling || dto.password !== undefined) {
      await this.auth.revokeSessions(id, roleChanged ? 'role_change' : disabling ? 'disabled' : 'password_change');
    }
    return toAdminUser(row);
  }

  async remove(actor: AdminRow, id: string): Promise<void> {
    if (actor.id === id) throw AppException.conflict('You cannot delete your own account');
    const target = await this.admins.findById(id);
    if (!target) throw AppException.notFound('Admin');
    if (target.role === 'super_admin' && target.status === 'active' && (await this.otherActiveSuperAdmins(id)) === 0) {
      throw AppException.conflict('The last active super admin cannot be deleted');
    }
    await this.auth.revokeSessions(id, 'deleted');
    await this.admins.delete(id);
  }
}
