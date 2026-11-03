import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import { callExternal } from '../external/external-call';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly config: AppConfig) {
    const c = config.cloudinary;
    if (c.configured) {
      cloudinary.config({ cloud_name: c.cloudName, api_key: c.apiKey, api_secret: c.apiSecret, secure: true });
    }
  }

  get configured(): boolean {
    return this.config.cloudinary.configured;
  }

  upload(buffer: Buffer, opts: { folder: string; resourceType?: 'image' }): Promise<UploadApiResponse> {
    if (!this.configured) throw AppException.badRequest('Cloudinary is not configured');
    return callExternal({ provider: 'cloudinary', operation: 'upload', retries: 1, timeoutMs: 60_000 }, () => {
      return new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: opts.folder, resource_type: opts.resourceType ?? 'image', unique_filename: true, overwrite: false },
          (err, result) => {
            if (result && !err) return resolve(result);
            const failure = new Error(err?.message ?? 'Cloudinary returned no result');
            Object.assign(failure, { http_code: err?.http_code });
            reject(failure);
          },
        );
        stream.end(buffer);
      });
    });
  }

  async destroy(publicId: string, resourceType = 'image'): Promise<void> {
    if (!this.configured) return;
    try {
      await callExternal({ provider: 'cloudinary', operation: 'destroy', retries: 2, timeoutMs: 20_000 }, () =>
        cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true }),
      );
    } catch {
      this.logger.warn({ provider: 'cloudinary' }, 'asset destroy failed (row removed anyway)');
    }
  }
}
