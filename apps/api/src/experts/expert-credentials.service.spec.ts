import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { ExpertCredentialsService } from './expert-credentials.service';

describe('ExpertCredentialsService', () => {
  it('rejects image credentials before accessing storage', async () => {
    const service = new ExpertCredentialsService(
      new ConfigService({ MINIO_ENDPOINT: 'http://localhost:9000', MINIO_ROOT_USER: 'test', MINIO_ROOT_PASSWORD: 'test-password' }),
      {} as PrismaService,
      {} as AuditService,
    );

    await expect(service.upload(crypto.randomUUID(), {
      originalname: 'credential.png',
      mimetype: 'image/png',
      size: 10,
      buffer: Buffer.from('not a pdf'),
    }, crypto.randomUUID())).rejects.toThrow('资质附件仅支持 PDF 文件');
  });

  it('rejects the eleventh credential', async () => {
    const service = new ExpertCredentialsService(
      new ConfigService({ MINIO_ENDPOINT: 'http://localhost:9000', MINIO_ROOT_USER: 'test', MINIO_ROOT_PASSWORD: 'test-password' }),
      {
        expertProfile: { findUnique: async () => ({ status: 'ACTIVE', reviewStatus: 'APPROVED' }) },
        attachment: { count: async () => 10 },
      } as unknown as PrismaService,
      {} as AuditService,
    );
    const pdf = Buffer.from('%PDF-1.7');
    await expect(service.upload(crypto.randomUUID(), {
      originalname: 'credential.pdf',
      mimetype: 'application/pdf',
      size: pdf.length,
      buffer: pdf,
    }, crypto.randomUUID())).rejects.toThrow('每位专家最多上传 10 份资质附件');
  });
});
