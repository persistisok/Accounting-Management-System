import { Module } from '@nestjs/common';
import { ExpertCredentialsService } from './expert-credentials.service';
import { ExpertsController } from './experts.controller';
import { ExpertsService } from './experts.service';

@Module({ controllers: [ExpertsController], providers: [ExpertsService, ExpertCredentialsService] })
export class ExpertsModule {}
