import { AppException } from '../errors/app.exception';

export interface DetectedType {
  ext: string;
  mime: string;
}

export const MB = 1024 * 1024;

export type UploadKind = 'audio' | 'transcript';

export interface ValidatedUpload {
  kind: UploadKind;
  /** Extension we store under (server-chosen). */
  ext: string;
  mime: string;
  /** Display-only, sanitised version of the client filename. */
  displayName: string;
}

const AUDIO_TYPES: Record<string, { ext: string; mime: string }> = {
  mp3: { ext: 'mp3', mime: 'audio/mpeg' },
  m4a: { ext: 'm4a', mime: 'audio/mp4' },
  mp4: { ext: 'm4a', mime: 'audio/mp4' },
  wav: { ext: 'wav', mime: 'audio/wav' },
  webm: { ext: 'webm', mime: 'audio/webm' },
  ogg: { ext: 'ogg', mime: 'audio/ogg' },
  oga: { ext: 'ogg', mime: 'audio/ogg' },
  opus: { ext: 'ogg', mime: 'audio/ogg' },
};
const TRANSCRIPT_EXTS = new Set(['txt', 'vtt', 'srt']);

export const MAX_AUDIO_BYTES = 200 * MB;
export const MAX_TRANSCRIPT_BYTES = 5 * MB;

/** Strips paths, control characters and odd symbols from a client filename (display only). */
export function sanitizeFilename(name: string | undefined, fallback = 'upload'): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

/** UTF-8 text without NUL bytes (a transcript has no magic number). */
export function isPlainText(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a meeting upload by its real content: audio must be sniffed (magic bytes) as one of the
 * allowed containers; transcripts must be valid UTF-8 text with a .txt/.vtt/.srt name.
 */
export function validateMeetingUpload(
  filename: string | undefined,
  buffer: Buffer,
  detected: DetectedType | undefined,
): ValidatedUpload {
  const displayName = sanitizeFilename(filename);
  if (!buffer.length) throw AppException.badRequest('The uploaded file is empty');
  if (detected) {
    const audio = AUDIO_TYPES[detected.ext];
    if (
      !audio ||
      !(detected.mime.startsWith('audio/') || detected.mime === 'video/mp4' || detected.mime === 'video/webm')
    ) {
      throw AppException.unsupportedMedia(
        'Upload an audio file (mp3, m4a, wav, webm, ogg) or a transcript (txt, vtt, srt)',
      );
    }
    if (buffer.length > MAX_AUDIO_BYTES) throw AppException.payloadTooLarge('Audio files can be at most 200 MB');
    return { kind: 'audio', ext: audio.ext, mime: audio.mime, displayName };
  }
  const ext = extensionOf(displayName);
  if (!TRANSCRIPT_EXTS.has(ext) || !isPlainText(buffer)) {
    throw AppException.unsupportedMedia(
      'Upload an audio file (mp3, m4a, wav, webm, ogg) or a transcript (txt, vtt, srt)',
    );
  }
  if (buffer.length > MAX_TRANSCRIPT_BYTES) throw AppException.payloadTooLarge('Transcripts can be at most 5 MB');
  return { kind: 'transcript', ext, mime: 'text/plain', displayName };
}

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  ico: 'image/x-icon',
};
export const MAX_IMAGE_BYTES = 10 * MB;

/** Admin media: raster images only (sniffed). SVG is rejected because it can carry script. */
export function validateImageUpload(filename: string | undefined, buffer: Buffer, detected: DetectedType | undefined) {
  const displayName = sanitizeFilename(filename, 'image');
  if (!buffer.length) throw AppException.badRequest('The uploaded file is empty');
  if (buffer.length > MAX_IMAGE_BYTES) throw AppException.payloadTooLarge('Images can be at most 10 MB');
  if (!detected || !IMAGE_TYPES[detected.ext]) {
    throw AppException.unsupportedMedia('Upload a PNG, JPG, WebP, GIF or ICO image (SVG is not accepted)');
  }
  return { ext: detected.ext, mime: IMAGE_TYPES[detected.ext], displayName };
}
