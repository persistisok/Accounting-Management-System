import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Client } from 'minio';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';

export const EXECUTOR_DOCUMENT_TYPES = [
  'EXECUTOR_BUSINESS_LICENSE',
  'EXECUTOR_COMMITMENT',
  'EXECUTOR_LEGAL_REP_ID',
] as const;
export type ExecutorDocumentType = typeof EXECUTOR_DOCUMENT_TYPES[number];

export interface OrganizationDocumentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class OrganizationDocumentsService {
  private readonly client: Client;
  private readonly bucket: string;
  private bucketReady?: Promise<void>;

  constructor(config: ConfigService, private readonly prisma: PrismaService, private readonly audit: AuditService) {
    const endpoint = new URL(config.get<string>('MINIO_ENDPOINT', 'http://localhost:9000'));
    this.bucket = config.get<string>('MINIO_BUCKET', 'business-ledger');
    this.client = new Client({
      endPoint: endpoint.hostname,
      port: Number(endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80)),
      useSSL: endpoint.protocol === 'https:',
      accessKey: config.get<string>('MINIO_ROOT_USER', 'ledger-minio'),
      secretKey: config.get<string>('MINIO_ROOT_PASSWORD', 'ledger-minio-local-password'),
    });
  }

  async upload(organizationId: string, rawDocumentType: string, file: OrganizationDocumentFile, actorUserId: string) {
    const documentType = this.parseType(rawDocumentType);
    this.validateFile(file);
    await this.assertExecutor(organizationId);
    const existing = await this.prisma.attachment.findFirst({ where: { objectType: documentType, objectId: organizationId } });
    if (existing) throw new BadRequestException('该类材料已上传，请先删除原文件');
    await this.ensureBucket();
    const extension = extname(file.originalname).toLowerCase();
    const storageKey = `executors/${organizationId}/documents/${randomUUID()}${extension}`;
    await this.client.putObject(this.bucket, storageKey, file.buffer, file.size, { 'Content-Type': file.mimetype });
    try {
      const attachment = await this.prisma.attachment.create({
        data: {
          objectType: documentType,
          objectId: organizationId,
          fileName: file.originalname.slice(0, 255),
          storageKey,
          contentType: file.mimetype,
          sizeBytes: BigInt(file.size),
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          uploadedBy: actorUserId,
        },
      });
      await this.audit.record({ actorUserId, action: 'UPLOAD', objectType: documentType, objectId: attachment.id, afterData: { organizationId, fileName: attachment.fileName } });
      return this.serialize(attachment);
    } catch (error) {
      await this.client.removeObject(this.bucket, storageKey).catch(() => undefined);
      throw error;
    }
  }

  async download(organizationId: string, attachmentId: string, actorUserId: string) {
    await this.assertExecutor(organizationId);
    const attachment = await this.findDocument(organizationId, attachmentId);
    await this.ensureBucket();
    const stream = await this.client.getObject(this.bucket, attachment.storageKey);
    await this.audit.record({ actorUserId, action: 'DOWNLOAD', objectType: attachment.objectType, objectId: attachment.id, afterData: { organizationId, fileName: attachment.fileName } });
    return { stream, attachment };
  }

  async remove(organizationId: string, attachmentId: string, actorUserId: string) {
    await this.assertExecutor(organizationId);
    const attachment = await this.findDocument(organizationId, attachmentId);
    await this.ensureBucket();
    await this.client.removeObject(this.bucket, attachment.storageKey);
    await this.prisma.attachment.delete({ where: { id: attachment.id } });
    await this.audit.record({ actorUserId, action: 'DELETE', objectType: attachment.objectType, objectId: attachment.id, beforeData: { organizationId, fileName: attachment.fileName } });
    return { id: attachment.id };
  }

  private parseType(value: string) {
    if (!EXECUTOR_DOCUMENT_TYPES.includes(value as ExecutorDocumentType)) throw new BadRequestException('不支持该执行方材料类型');
    return value as ExecutorDocumentType;
  }

  private validateFile(file: OrganizationDocumentFile) {
    const extension = extname(file.originalname).toLowerCase();
    const header = file.buffer.subarray(0, 16);
    const validPdf = extension === '.pdf' && file.mimetype === 'application/pdf' && header.includes(Buffer.from('%PDF-'));
    const validJpeg = ['.jpg', '.jpeg'].includes(extension) && file.mimetype === 'image/jpeg' && header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    const validPng = extension === '.png' && file.mimetype === 'image/png' && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (!validPdf && !validJpeg && !validPng) throw new BadRequestException('执行方材料仅支持 PDF、JPG 或 PNG 文件');
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new BadRequestException('单个执行方材料大小必须在 10MB 以内');
  }

  private async assertExecutor(organizationId: string) {
    const executor = await this.prisma.organization.findFirst({ where: { id: organizationId, roles: { some: { roleType: 'EXECUTOR' } } }, select: { id: true } });
    if (!executor) throw new NotFoundException('执行方不存在');
  }

  private async findDocument(organizationId: string, attachmentId: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, objectId: organizationId, objectType: { in: [...EXECUTOR_DOCUMENT_TYPES] } },
    });
    if (!attachment) throw new NotFoundException('执行方材料不存在');
    return attachment;
  }

  private ensureBucket() {
    if (!this.bucketReady) {
      this.bucketReady = (async () => {
        if (!await this.client.bucketExists(this.bucket)) await this.client.makeBucket(this.bucket);
      })().catch((error) => { this.bucketReady = undefined; throw error; });
    }
    return this.bucketReady;
  }

  private serialize(attachment: { id: string; objectType: string; fileName: string; contentType: string; sizeBytes: bigint; createdAt: Date }) {
    return { id: attachment.id, documentType: attachment.objectType, fileName: attachment.fileName, contentType: attachment.contentType, sizeBytes: attachment.sizeBytes.toString(), createdAt: attachment.createdAt };
  }
}
