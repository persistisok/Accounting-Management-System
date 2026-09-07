import { Module } from '@nestjs/common';
import { LedgerAttachmentsModule } from '../attachments/ledger-attachments.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [LedgerAttachmentsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
