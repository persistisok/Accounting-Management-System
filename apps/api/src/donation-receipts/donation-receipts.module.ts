import { Module } from '@nestjs/common';
import { DonationReceiptsController } from './donation-receipts.controller';
import { DonationReceiptsService } from './donation-receipts.service';

@Module({ controllers: [DonationReceiptsController], providers: [DonationReceiptsService] })
export class DonationReceiptsModule {}
