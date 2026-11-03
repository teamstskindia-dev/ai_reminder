import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { detectFileType } from '../../common/files/detect-file-type';
import { validateImageUpload } from '../../common/files/file-validation';
import { Paginated } from '../../common/pagination/pagination';
import type { MediaAsset } from '../../common/types/api.types';
import { CloudinaryService } from '../../infra/cloudinary/cloudinary.service';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { toMediaAsset } from '../content/content.mapper';

/** Admin media library (Cloudinary). Images are sniffed by magic bytes; SVG is rejected. */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async list(q: { folder?: string; q?: string; page: number; limit: number }): Promise<Paginated<MediaAsset>> {
    const search = q.q?.trim();
    const where: Prisma.MediaAssetWhereInput = {
      ...(q.folder ? { folder: q.folder } : {}),
      ...(search
        ? {
            OR: [
              { publicId: { contains: search, mode: 'insensitive' } },
              { alt: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.mediaAsset.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    return Paginated.of(rows.map(toMediaAsset), total, q.page, q.limit);
  }

  async upload(
    file: { originalname?: string; buffer: Buffer } | undefined,
    opts: { folder?: string; alt?: string },
    adminId: string,
  ): Promise<MediaAsset> {
    if (!file?.buffer) throw AppException.validation([{ field: 'file', messages: ['file is required'] }]);
    if (!this.cloudinary.configured) throw AppException.badRequest('Cloudinary is not configured');
    validateImageUpload(file.originalname, file.buffer, await detectFileType(file.buffer));
    const folder = opts.folder ?? 'general';
    const res = await this.cloudinary.upload(file.buffer, { folder: `remi/${folder}`, resourceType: 'image' });
    const row = await this.prisma.mediaAsset.create({
      data: {
        publicId: res.public_id,
        url: res.secure_url,
        resourceType: res.resource_type ?? 'image',
        format: res.format ?? null,
        width: res.width ?? null,
        height: res.height ?? null,
        bytes: res.bytes ?? null,
        folder,
        alt: opts.alt ?? null,
        uploadedBy: adminId,
      },
    });
    return toMediaAsset(row);
  }

  async updateAlt(id: string, alt: string | null): Promise<MediaAsset> {
    const exists = await this.prisma.mediaAsset.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw AppException.notFound('Media asset');
    return toMediaAsset(await this.prisma.mediaAsset.update({ where: { id }, data: { alt } }));
  }

  async remove(id: string): Promise<void> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw AppException.notFound('Media asset');
    await this.cloudinary.destroy(asset.publicId, asset.resourceType);
    await this.prisma.mediaAsset.delete({ where: { id } });
  }
}
