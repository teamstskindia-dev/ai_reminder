import { ApiProperty } from '@nestjs/swagger';
import { ApiInteger } from '../../common/swagger/api-docs.decorators';

/** Health responses are returned as-is (no `{ success, data }` envelope). */

export class HealthLive {
  @ApiProperty({ enum: ['ok'] }) status: 'ok';
  /** Process uptime in seconds. */
  @ApiInteger({ minimum: 0 }) uptime: number;
  /** Git SHA of the running image (`dev` locally). */
  version: string;
}

export class HealthChecks {
  redis: boolean;
  database: boolean;
}

export class HealthReady {
  @ApiProperty({ enum: ['ok', 'degraded'] }) status: 'ok' | 'degraded';
  checks: HealthChecks;
}
