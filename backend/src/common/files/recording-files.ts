/** One uploaded part of a capture, in recording order. */
export interface RecordingPart {
  index: number;
  path: string;
  durationMs: number;
  bytes?: number;
}

/** Reads `meetings.recording_parts` defensively (it is JSON). */
export function toRecordingParts(raw: unknown): RecordingPart[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .filter((p) => typeof p.path === 'string' && Number.isInteger(p.index))
    .map((p) => ({
      index: p.index as number,
      path: p.path as string,
      durationMs: typeof p.durationMs === 'number' && p.durationMs > 0 ? Math.round(p.durationMs) : 0,
      bytes: typeof p.bytes === 'number' ? p.bytes : undefined,
    }))
    .sort((a, b) => a.index - b.index);
}

/**
 * Every stored file of a meeting: an uploaded recording and/or the audio parts of a capture. Use it whenever a
 * meeting (or its owner) is deleted so no audio is left behind in storage.
 */
export function storedRecordingPaths(row: { recordingPath: string | null; recordingParts: unknown }): string[] {
  const paths = toRecordingParts(row.recordingParts).map((p) => p.path);
  if (row.recordingPath) paths.push(row.recordingPath);
  return [...new Set(paths)];
}
