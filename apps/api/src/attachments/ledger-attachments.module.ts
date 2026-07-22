import { Module } from '@nestjs/common';
import { LedgerAttachmentsController } from './ledger-attachments.controller';
import { LedgerAttachmentsService } from './ledger-attachments.service';

@Module({ controllers: [LedgerAttachmentsController], providers: [LedgerAttachmentsService] })
export class LedgerAttachmentsModule {}
