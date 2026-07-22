import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Client } from 'minio';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import { LedgerAttachmentObjectType, serializeAttachment } from './attachment-view';

export interface LedgerAttachmentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const objectTypes = new Set<LedgerAttachmentObjectType>(['PROJECT', 'CONTRACT', 'BANK_TRANSACTION', 'INVOICE']);

@Injectable()
export class LedgerAttachmentsService {
  private readonly client: Client;
  private readonly bucket: string;
  private bucketReady?: Promise<void>;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
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

  async list(rawObjectType: string, objectId: string) {
    const objectType = this.parseObjectType(rawObjectType);
    await this.assertObjectExists(objectType, objectId);
    const attachments = await this.prisma.attachment.findMany({
      where: { objectType, objectId },
      select: { id: true, objectId: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return attachments.map(serializeAttachment);
  }

  async upload(rawObjectType: string, objectId: string, file: LedgerAttachmentFile, actorUserId: string) {
    const objectType = this.parseObjectType(rawObjectType);
    this.assertPdf(file);
    await this.assertObjectExists(objectType, objectId);
    const attachmentCount = await this.prisma.attachment.count({ where: { objectType, objectId } });
    if (attachmentCount >= 10) throw new BadRequestException('每条业务记录最多上传 10 份附件');
    await this.ensureBucket();

    const storageKey = `ledgers/${objectType.toLowerCase()}/${objectId}/${randomUUID()}.pdf`;
    await this.client.putObject(this.bucket, storageKey, file.buffer, file.size, { 'Content-Type': 'application/pdf' });
    try {
      const attachment = await this.prisma.attachment.create({
        data: {
          objectType,
          objectId,
          fileName: file.originalname.slice(0, 255),
          storageKey,
          contentType: 'application/pdf',
          sizeBytes: BigInt(file.size),
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          uploadedBy: actorUserId,
        },
        select: { id: true, objectId: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true },
      });
      await this.audit.record({
        actorUserId,
        action: 'UPLOAD',
        objectType,
        objectId,
        afterData: { attachmentId: attachment.id, fileName: attachment.fileName },
      });
      return serializeAttachment(attachment);
    } catch (error) {
      await this.client.removeObject(this.bucket, storageKey).catch(() => undefined);
      throw error;
    }
  }

  async download(rawObjectType: string, objectId: string, attachmentId: string, actorUserId: string) {
    const objectType = this.parseObjectType(rawObjectType);
    await this.assertObjectExists(objectType, objectId);
    const attachment = await this.findAttachment(objectType, objectId, attachmentId);
    await this.ensureBucket();
    const stream = await this.client.getObject(this.bucket, attachment.storageKey);
    await this.audit.record({
      actorUserId,
      action: 'DOWNLOAD',
      objectType,
      objectId,
      afterData: { attachmentId: attachment.id, fileName: attachment.fileName },
    });
    return { stream, attachment };
  }

  async remove(rawObjectType: string, objectId: string, attachmentId: string, actorUserId: string) {
    const objectType = this.parseObjectType(rawObjectType);
    await this.assertObjectExists(objectType, objectId);
    const attachment = await this.findAttachment(objectType, objectId, attachmentId);
    await this.ensureBucket();
    await this.client.removeObject(this.bucket, attachment.storageKey);
    await this.prisma.attachment.delete({ where: { id: attachment.id } });
    await this.audit.record({
      actorUserId,
      action: 'DELETE_ATTACHMENT',
      objectType,
      objectId,
      beforeData: { attachmentId: attachment.id, fileName: attachment.fileName },
    });
    return { id: attachment.id };
  }

  private parseObjectType(value: string): LedgerAttachmentObjectType {
    if (!objectTypes.has(value as LedgerAttachmentObjectType)) throw new BadRequestException('不支持该业务对象的附件');
    return value as LedgerAttachmentObjectType;
  }

  private assertPdf(file: LedgerAttachmentFile) {
    const hasPdfHeader = file.buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'));
    if (file.mimetype !== 'application/pdf' || extname(file.originalname).toLowerCase() !== '.pdf' || !hasPdfHeader) {
      throw new BadRequestException('附件仅支持 PDF 文件');
    }
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new BadRequestException('单个附件大小必须在 10MB 以内');
  }

  private async assertObjectExists(objectType: LedgerAttachmentObjectType, objectId: string) {
    const exists = objectType === 'PROJECT'
      ? await this.prisma.project.findUnique({ where: { id: objectId }, select: { id: true } })
      : objectType === 'CONTRACT'
        ? await this.prisma.contract.findUnique({ where: { id: objectId }, select: { id: true } })
        : objectType === 'BANK_TRANSACTION'
          ? await this.prisma.bankTransaction.findUnique({ where: { id: objectId }, select: { id: true } })
          : await this.prisma.invoice.findUnique({ where: { id: objectId }, select: { id: true } });
    if (!exists) throw new NotFoundException('业务记录不存在');
  }

  private async findAttachment(objectType: LedgerAttachmentObjectType, objectId: string, attachmentId: string) {
    const attachment = await this.prisma.attachment.findFirst({ where: { id: attachmentId, objectType, objectId } });
    if (!attachment) throw new NotFoundException('附件不存在');
    return attachment;
  }

  private ensureBucket() {
    if (!this.bucketReady) {
      this.bucketReady = (async () => {
        if (!await this.client.bucketExists(this.bucket)) await this.client.makeBucket(this.bucket);
      })().catch((error) => {
        this.bucketReady = undefined;
        throw error;
      });
    }
    return this.bucketReady;
  }
}
