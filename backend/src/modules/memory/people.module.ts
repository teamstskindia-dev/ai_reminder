import { Module } from '@nestjs/common';
import { NameFixService } from './name-fix.service';
import { PeopleService } from './people.service';

/**
 * People cards and name fixes (user-flow §10). No AI dependencies, so the AI pipeline can use it to apply
 * name corrections to new transcripts and add finished conversations to people cards.
 */
@Module({
  providers: [PeopleService, NameFixService],
  exports: [PeopleService, NameFixService],
})
export class PeopleModule {}
