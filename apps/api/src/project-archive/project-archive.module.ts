import { Module } from '@nestjs/common';
import { ProjectArchiveController } from './project-archive.controller';
import { ProjectArchiveService } from './project-archive.service';

@Module({ controllers: [ProjectArchiveController], providers: [ProjectArchiveService], exports: [ProjectArchiveService] })
export class ProjectArchiveModule {}
