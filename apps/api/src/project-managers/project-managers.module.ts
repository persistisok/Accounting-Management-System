import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma.module';
import { ProjectManagersController } from './project-managers.controller';
import { ProjectManagersService } from './project-managers.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [ProjectManagersController],
  providers: [ProjectManagersService],
})
export class ProjectManagersModule {}
