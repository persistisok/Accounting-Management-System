import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { LedgerAttachmentsService } from './ledger-attachments.service';

const config = new ConfigService({
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ROOT_USER: 'test',
  MINIO_ROOT_PASSWORD: 'test-password',
});

describe('LedgerAttachmentsService', () => {
  const service = new LedgerAttachmentsService(
    config,
    {} as PrismaService,
    {} as AuditService,
  );

  it('rejects non-PDF content types before accessing storage', async () => {
    await expect(service.upload('PROJECT', crypto.randomUUID(), {
      originalname: 'document.pdf',
      mimetype: 'image/png',
      size: 10,
      buffer: Buffer.from('not a pdf'),
    }, crypto.randomUUID())).rejects.toThrow('附件仅支持 PDF 文件');
  });

  it('rejects a non-PDF extension even when the MIME type is PDF', async () => {
    await expect(service.upload('INVOICE', crypto.randomUUID(), {
      originalname: 'document.png',
      mimetype: 'application/pdf',
      size: 10,
      buffer: Buffer.from('not a pdf'),
    }, crypto.randomUUID())).rejects.toThrow('附件仅支持 PDF 文件');
  });

  it('rejects a file without a PDF header', async () => {
    await expect(service.upload('CONTRACT', crypto.randomUUID(), {
      originalname: 'document.pdf',
      mimetype: 'application/pdf',
      size: 10,
      buffer: Buffer.from('not a pdf'),
    }, crypto.randomUUID())).rejects.toThrow('附件仅支持 PDF 文件');
  });

  it('rejects the eleventh attachment', async () => {
    const limitedService = new LedgerAttachmentsService(
      config,
      {
        project: { findUnique: async () => ({ id: crypto.randomUUID() }) },
        attachment: { count: async () => 10 },
      } as unknown as PrismaService,
      {} as AuditService,
    );
    const pdf = Buffer.from('%PDF-1.7');
    await expect(limitedService.upload('PROJECT', crypto.randomUUID(), {
      originalname: 'document.pdf',
      mimetype: 'application/pdf',
      size: pdf.length,
      buffer: pdf,
    }, crypto.randomUUID())).rejects.toThrow('每条业务记录最多上传 10 份附件');
  });

  it('supports membership attachments and applies the same ten-file limit', async () => {
    const limitedService = new LedgerAttachmentsService(
      config,
      {
        membership: { findUnique: async () => ({ id: crypto.randomUUID() }) },
        attachment: { count: async () => 10 },
      } as unknown as PrismaService,
      {} as AuditService,
    );
    const pdf = Buffer.from('%PDF-1.7');
    await expect(limitedService.upload('MEMBERSHIP', crypto.randomUUID(), {
      originalname: 'member.pdf', mimetype: 'application/pdf', size: pdf.length, buffer: pdf,
    }, crypto.randomUUID())).rejects.toThrow('每条业务记录最多上传 10 份附件');
  });

  it('rejects unsupported project multipart file signatures before contacting OSS', async () => {
    const projectId = crypto.randomUUID();
    const ossService = new LedgerAttachmentsService(
      new ConfigService({ OSS_ENABLED: 'true', JWT_SECRET: 'test-secret' }),
      {
        project: { findUnique: async () => ({ id: projectId }) },
        attachment: { count: async () => 0 },
      } as unknown as PrismaService,
      {} as AuditService,
    );
    await expect(ossService.initProjectMultipart(
      projectId,
      'payload.exe',
      100,
      Buffer.from('MZ').toString('base64'),
      crypto.randomUUID(),
    )).rejects.toThrow('项目附件仅支持有效的 PDF、ZIP、RAR 或 7Z 文件');
  });
});
