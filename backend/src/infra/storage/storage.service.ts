import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import { callExternal } from '../external/external-call';

/** Supabase Storage accepts at most 1000 paths per remove call. */
export const REMOVE_BATCH_SIZE = 1000;

/**
 * Supabase Storage (service role, server only) for the private `recordings` bucket.
 * supabase-js is used exclusively for Storage; all database access goes through Prisma.
 *
 * Outside production, when Supabase is not configured, files go to a local folder instead
 * (`.data/storage/{bucket}` under the backend's working directory) so recordings can be tested on one
 * machine. The api and the worker must then share that folder (they do when run side by side).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: SupabaseClient | null;
  private readonly localRoot: string | null;
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
    this.localRoot =
      !this.client && !config.isProduction ? resolve(process.cwd(), '.data', 'storage', this.bucket) : null;
  }

  get configured(): boolean {
    return this.client !== null || this.localRoot !== null;
  }

  private get storage() {
    if (!this.client) throw AppException.badRequest('File storage (Supabase Storage) is not configured');
    return this.client.storage;
  }

  /** Absolute local path for a storage path, refusing anything that escapes the local root. */
  private localPath(path: string): string {
    const root = this.localRoot as string;
    const full = resolve(root, path);
    if (!full.startsWith(root + sep)) throw AppException.badRequest('Invalid storage path');
    return full;
  }

  /** Creates the private recordings bucket when missing. Never throws (logs instead). */
  async ensureBucket(): Promise<void> {
    if (this.localRoot) {
      this.logger.warn(`Supabase Storage not configured: using local files in ${this.localRoot} (development only)`);
      return;
    }
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
    if (this.localRoot) {
      const full = this.localPath(path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, body);
      return;
    }
    const bucket = this.storage.from(this.bucket);
    await callExternal({ provider: 'storage', operation: 'upload', retries: 2, timeoutMs: 300_000 }, async () => {
      const { error } = await bucket.upload(path, body, { contentType, upsert: true });
      if (error) throw error;
    });
  }

  async download(path: string): Promise<Blob> {
    if (this.localRoot) return new Blob([new Uint8Array(await readFile(this.localPath(path)))]);
    const bucket = this.storage.from(this.bucket);
    return callExternal({ provider: 'storage', operation: 'download', retries: 2, timeoutMs: 300_000 }, async () => {
      const { data, error } = await bucket.download(path);
      if (error || !data) throw error ?? new Error('storage download returned no data');
      return data;
    });
  }

  /**
   * Deletes files, in batches of REMOVE_BATCH_SIZE with a timeout and retries per batch. Never throws: a
   * failed batch is logged and the others still run, so a storage hiccup cannot block a meeting or account
   * deletion.
   */
  async remove(paths: string[]): Promise<void> {
    const unique = [...new Set(paths)];
    if (!unique.length) return;
    if (this.localRoot) {
      await Promise.all(unique.map((p) => rm(this.localPath(p), { force: true }).catch(() => undefined)));
      return;
    }
    if (!this.client) return;
    const bucket = this.client.storage.from(this.bucket);
    let failed = 0;
    for (let i = 0; i < unique.length; i += REMOVE_BATCH_SIZE) {
      const batch = unique.slice(i, i + REMOVE_BATCH_SIZE);
      try {
        await callExternal({ provider: 'storage', operation: 'remove', retries: 2, timeoutMs: 30_000 }, async () => {
          const { error } = await bucket.remove(batch);
          if (error) throw error;
        });
      } catch {
        failed += batch.length;
      }
    }
    if (failed) {
      this.logger.error({ provider: 'storage', files: unique.length, failed }, 'could not delete stored files');
    }
  }
}
