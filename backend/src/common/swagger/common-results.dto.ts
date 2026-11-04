import { ApiProperty } from '@nestjs/swagger';

/** Small acknowledgement bodies shared by several routes. */

export class QueuedResult {
  /** The work was queued and runs in the background. */
  @ApiProperty({ enum: [true] })
  queued: true;
}
