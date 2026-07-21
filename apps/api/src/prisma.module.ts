import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SensitiveDataService } from './common/sensitive-data.service';

@Global()
@Module({
  providers: [PrismaService, SensitiveDataService],
  exports: [PrismaService, SensitiveDataService],
})
export class PrismaModule {}
