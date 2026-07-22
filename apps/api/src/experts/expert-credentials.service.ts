import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Client } from 'minio';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';

export interface ExpertCredentialFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class ExpertCredentialsService {
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

  async upload(expertId: string, file: ExpertCredentialFile, actorUserId: string) {
    const hasPdfHeader = file.buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'));
    if (file.mimetype !== 'application/pdf' || extname(file.originalname).toLowerCase() !== '.pdf' || !hasPdfHeader) {
      throw new BadRequestException('资质附件仅支持 PDF 文件');
    }
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new BadRequestException('单个资质附件大小必须在 10MB 以内');
    await this.assertExpertOperable(expertId);
    const attachmentCount = await this.prisma.attachment.count({
      where: { objectType: 'EXPERT_CREDENTIAL', objectId: expertId },
    });
    if (attachmentCount >= 10) throw new BadRequestException('每位专家最多上传 10 份资质附件');

    await this.ensureBucket();
    const suffix = extname(file.originalname).toLowerCase().slice(0, 12);
    const storageKey = `experts/${expertId}/credentials/${randomUUID()}${suffix}`;
    await this.client.putObject(this.bucket, storageKey, file.buffer, file.size, { 'Content-Type': file.mimetype });
    try {
      const attachment = await this.prisma.attachment.create({
        data: {
          objectType: 'EXPERT_CREDENTIAL',
          objectId: expertId,
          fileName: file.originalname.slice(0, 255),
          storageKey,
          contentType: file.mimetype,
          sizeBytes: BigInt(file.size),
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          uploadedBy: actorUserId,
        },
      });
      await this.audit.record({ actorUserId, action: 'UPLOAD', objectType: 'EXPERT_CREDENTIAL', objectId: attachment.id, afterData: { expertId, fileName: attachment.fileName } });
      return this.serialize(attachment);
    } catch (error) {
      await this.client.removeObject(this.bucket, storageKey).catch(() => undefined);
      throw error;
    }
  }

  async download(expertId: string, attachmentId: string, actorUserId: string) {
    await this.assertExpertOperable(expertId);
    const attachment = await this.findCredential(expertId, attachmentId);
    await this.ensureBucket();
    const stream = await this.client.getObject(this.bucket, attachment.storageKey);
    await this.audit.record({ actorUserId, action: 'VIEW_SENSITIVE', objectType: 'EXPERT_CREDENTIAL', objectId: attachment.id, afterData: { expertId, fileName: attachment.fileName } });
    return { stream, attachment };
  }

  async remove(expertId: string, attachmentId: string, actorUserId: string) {
    await this.assertExpertOperable(expertId);
    const attachment = await this.findCredential(expertId, attachmentId);
    await this.ensureBucket();
    await this.client.removeObject(this.bucket, attachment.storageKey);
    await this.prisma.attachment.delete({ where: { id: attachment.id } });
    await this.audit.record({ actorUserId, action: 'DELETE', objectType: 'EXPERT_CREDENTIAL', objectId: attachment.id, beforeData: { expertId, fileName: attachment.fileName } });
    return { id: attachment.id };
  }

  private async findCredential(expertId: string, attachmentId: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, objectType: 'EXPERT_CREDENTIAL', objectId: expertId },
    });
    if (!attachment) throw new NotFoundException('专家资质附件不存在');
    return attachment;
  }

  private async assertExpertOperable(expertId: string) {
    const expert = await this.prisma.expertProfile.findUnique({
      where: { id: expertId }, select: { status: true, reviewStatus: true },
    });
    if (!expert) throw new NotFoundException('专家不存在');
    if (expert.status === 'INACTIVE') throw new BadRequestException('已停用专家不能操作资质附件');
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

  private serialize(attachment: { id: string; fileName: string; contentType: string; sizeBytes: bigint; createdAt: Date }) {
    return {
      id: attachment.id,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes.toString(),
      createdAt: attachment.createdAt,
    };
  }
}
