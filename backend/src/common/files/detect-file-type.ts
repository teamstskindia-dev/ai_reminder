import { fileTypeFromBuffer } from 'file-type';
import type { DetectedType } from './file-validation';

/** Magic-byte sniffing (file-type is ESM-only; loaded through Node's require(esm)). */
export async function detectFileType(buffer: Buffer): Promise<DetectedType | undefined> {
  const res = await fileTypeFromBuffer(buffer);
  return res ? { ext: res.ext, mime: res.mime } : undefined;
}
