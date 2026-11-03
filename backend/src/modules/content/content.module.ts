import { Module } from '@nestjs/common';
import { PublicContentService } from './public-content.service';

@Module({
  providers: [PublicContentService],
  exports: [PublicContentService],
})
export class ContentModule {}
