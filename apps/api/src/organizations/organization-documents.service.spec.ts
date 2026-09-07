import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { OrganizationDocumentsService } from './organization-documents.service';

const service = new OrganizationDocumentsService(
  new ConfigService({ MINIO_ENDPOINT: 'http://localhost:9000', MINIO_ROOT_USER: 'test', MINIO_ROOT_PASSWORD: 'test-password' }),
  {} as PrismaService,
  {} as AuditService,
);

describe('OrganizationDocumentsService', () => {
  it('rejects unsupported material types', async () => {
    await expect(service.upload(crypto.randomUUID(), 'UNKNOWN', {
      originalname: 'document.pdf', mimetype: 'application/pdf', size: 8, buffer: Buffer.from('%PDF-1.7'),
    }, crypto.randomUUID())).rejects.toThrow('不支持该执行方材料类型');
  });

  it('rejects files whose extension and signature do not match', async () => {
    await expect(service.upload(crypto.randomUUID(), 'EXECUTOR_BUSINESS_LICENSE', {
      originalname: 'license.png', mimetype: 'image/png', size: 8, buffer: Buffer.from('not png!'),
    }, crypto.randomUUID())).rejects.toThrow('仅支持 PDF、JPG 或 PNG');
  });
});
