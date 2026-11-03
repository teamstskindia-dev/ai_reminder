import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { PaginationMeta } from '../types/api.types';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

/** Returned by services for paginated lists; the envelope interceptor turns it into `{ data, meta }`. */
export class Paginated<T> {
  constructor(
    readonly items: T[],
    readonly meta: PaginationMeta,
  ) {}

  static of<T>(items: T[], total: number, page: number, limit: number): Paginated<T> {
    return new Paginated(items, { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
  }
}

/** Inclusive PostgREST range for a page. */
export function pageRange(page: number, limit: number): [number, number] {
  const from = (page - 1) * limit;
  return [from, from + limit - 1];
}
