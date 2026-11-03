import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import { callExternal } from '../external/external-call';

/**
 * Supabase Storage (service role, server only) for the private `recordings` bucket.
 * supabase-js is used exclusively for Storage; all database access goes through Prisma.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: SupabaseClient | null;
  readonly bucket: string;

  constructor(config: AppConfig) {
    const s = config.supabase;
    this.bucket = s.recordingsBucket;
    this.client =
      s.storageConfigured && s.url && s.serviceRoleKey
        ? createClient(s.url, s.serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          })
        : null;
  }

  get configured(): boolean {
    return this.client !== null;
  }

  private get storage() {
    if (!this.client) throw AppException.badRequest('File storage (Supabase Storage) is not configured');
    return this.client.storage;
  }

  /** Creates the private recordings bucket when missing. Never throws (logs instead). */
  async ensureBucket(): Promise<void> {
    if (!this.client) {
      this.logger.warn('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: uploads are disabled');
      return;
    }
    try {
      const { data, error } = await this.client.storage.getBucket(this.bucket);
      if (data && !error) return;
      const created = await this.client.storage.createBucket(this.bucket, { public: false });
      if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
      this.logger.log(`Created private storage bucket "${this.bucket}"`);
    } catch (err) {
      this.logger.warn(`Could not ensure storage bucket "${this.bucket}": ${(err as Error).message}`);
    }
  }

  async upload(path: string, body: Buffer, contentType: string): Promise<void> {
    const bucket = this.storage.from(this.bucket);
    await callExternal({ provider: 'storage', operation: 'upload', retries: 2, timeoutMs: 300_000 }, async () => {
      const { error } = await bucket.upload(path, body, { contentType, upsert: true });
      if (error) throw error;
    });
  }

  async download(path: string): Promise<Blob> {
    const bucket = this.storage.from(this.bucket);
    return callExternal({ provider: 'storage', operation: 'download', retries: 2, timeoutMs: 300_000 }, async () => {
      const { data, error } = await bucket.download(path);
      if (error || !data) throw error ?? new Error('storage download returned no data');
      return data;
    });
  }

  async remove(paths: string[]): Promise<void> {
    if (!paths.length || !this.client) return;
    const { error } = await this.client.storage.from(this.bucket).remove(paths);
    if (error) this.logger.warn({ provider: 'storage', files: paths.length }, 'could not delete stored files');
  }
}
