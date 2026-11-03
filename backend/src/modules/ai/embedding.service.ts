import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../../infra/gemini/gemini.service';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SettingsService } from '../content/settings.service';
import { chunkLines } from './transcript-format';

export interface ChunkMatch {
  meetingId: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}

/** pgvector text literal; passed as a bound parameter (never concatenated into SQL). */
export function toVectorLiteral(values: number[]): string {
  return `[${values.map((v) => (Number.isFinite(v) ? v.toFixed(7) : '0')).join(',')}]`;
}

/** Meeting memory: chunk + embed into meeting_chunks, and semantic search via match_meeting_chunks. */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly settings: SettingsService,
  ) {}

  /** Replaces all chunks of a meeting. Chunk 0 is the report digest, the rest is the transcript. */
  async indexMeeting(meetingId: string, userId: string, digest: string, transcriptLines: string[]): Promise<number> {
    const ai = await this.settings.get('ai');
    if (!ai.enableEmbeddings) return 0;
    const chunks = [digest.slice(0, 1500), ...chunkLines(transcriptLines, 1500, 200)].filter((c) => c.trim());
    const vectors = await this.gemini.embed(chunks, ai.embeddingModel, 'RETRIEVAL_DOCUMENT');
    await this.prisma.$transaction([
      this.prisma.meetingChunk.deleteMany({ where: { meetingId } }),
      ...chunks.map(
        (content, i) => this.prisma.$executeRaw`
          insert into public.meeting_chunks (meeting_id, user_id, chunk_index, content, embedding)
          values (${meetingId}::uuid, ${userId}::uuid, ${i}, ${content}, ${toVectorLiteral(vectors[i])}::extensions.vector)`,
      ),
    ]);
    this.logger.log({ meetingId, chunks: chunks.length }, 'meeting indexed');
    return chunks.length;
  }

  async search(
    userId: string,
    query: string,
    opts: { k?: number; meetingId?: string | null; minSimilarity?: number } = {},
  ): Promise<ChunkMatch[]> {
    const ai = await this.settings.get('ai');
    const [vector] = await this.gemini.embed([query], ai.embeddingModel, 'RETRIEVAL_QUERY');
    const k = Math.min(Math.max(opts.k ?? 8, 1), 20);
    const minSimilarity = opts.minSimilarity ?? (this.gemini.isMock ? 0.05 : 0.3);
    const rows = await this.prisma.$queryRaw<
      { meeting_id: string; chunk_index: number; content: string; similarity: number }[]
    >(
      Prisma.sql`select meeting_id, chunk_index, content, similarity
                 from public.match_meeting_chunks(${userId}::uuid, ${toVectorLiteral(vector)}::extensions.vector,
                                                  ${k}::int, ${opts.meetingId ?? null}::uuid, ${minSimilarity}::float)`,
    );
    return rows.map((r) => ({
      meetingId: r.meeting_id,
      chunkIndex: Number(r.chunk_index),
      content: r.content,
      similarity: Math.round(Number(r.similarity) * 1000) / 1000,
    }));
  }
}
