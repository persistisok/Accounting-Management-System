import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Credential, { Config as CredentialConfig } from '@alicloud/credentials';
import OSS from 'ali-oss';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { extname } from 'node:path';
import { Client } from 'minio';
import { AuditService } from '../audit/audit.service';
import { assertPermission, type PermissionLevelValue, type PermissionResourceValue } from '../auth/permissions';
import type { AuthUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma.service';
import { LedgerAttachmentObjectType, serializeAttachment } from './attachment-view';

export interface LedgerAttachmentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const objectTypes = new Set<LedgerAttachmentObjectType>(['PROJECT', 'CONTRACT', 'BANK_TRANSACTION', 'INVOICE', 'MEMBERSHIP']);
const OSS_PROVIDER = 'OSS';
const PROJECT_ATTACHMENT_LIMIT = 5 * 1024 * 1024 * 1024;
const MULTIPART_PART_SIZE = 64 * 1024 * 1024;

interface MultipartUploadToken {
  version: 1;
  objectType: 'PROJECT';
  objectId: string;
  actorUserId: string;
  storageKey: string;
  uploadId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  expiresAt: number;
}

@Injectable()
export class LedgerAttachmentsService {
  private readonly localClient: Client;
  private readonly localBucket: string;
  private bucketReady?: Promise<void>;
  private readonly ossEnabled: boolean;
  private readonly ossBucket: string;
  private readonly ossRegion: string;
  private readonly ossPublicEndpoint: string;
  private readonly ossInternalEndpoint: string;
  private readonly ossPrefix: string;
  private readonly uploadTokenSecret: string;
  private readonly credentialClient?: Credential;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    const endpoint = new URL(config.get<string>('MINIO_ENDPOINT', 'http://localhost:9000'));
    this.localBucket = config.get<string>('MINIO_BUCKET', 'business-ledger');
    this.localClient = new Client({
      endPoint: endpoint.hostname,
      port: Number(endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80)),
      useSSL: endpoint.protocol === 'https:',
      accessKey: config.get<string>('MINIO_ROOT_USER', 'ledger-minio'),
      secretKey: config.get<string>('MINIO_ROOT_PASSWORD', 'ledger-minio-local-password'),
    });

    this.ossEnabled = config.get<string>('OSS_ENABLED', 'false').toLowerCase() === 'true';
    this.ossBucket = config.get<string>('OSS_BUCKET', 'accounting-management-system');
    this.ossRegion = config.get<string>('OSS_REGION', 'oss-cn-shanghai');
    this.ossPublicEndpoint = config.get<string>('OSS_PUBLIC_ENDPOINT', 'https://oss-cn-shanghai.aliyuncs.com');
    this.ossInternalEndpoint = config.get<string>('OSS_INTERNAL_ENDPOINT', 'https://oss-cn-shanghai-internal.aliyuncs.com');
    this.ossPrefix = config.get<string>('OSS_PREFIX', 'business-ledger').replace(/^\/+|\/+$/g, '');
    this.uploadTokenSecret = config.get<string>('JWT_SECRET', 'local-development-jwt-secret-change-before-production');
    if (this.ossEnabled) {
      const roleName = config.get<string>('OSS_ECS_ROLE_NAME', '');
      this.credentialClient = roleName
        ? new Credential(new CredentialConfig({ type: 'ecs_ram_role', roleName }))
        : new Credential();
    }
  }

  async authorize(rawObjectType: string, objectId: string, user: AuthUser, level: PermissionLevelValue) {
    const objectType = this.parseObjectType(rawObjectType);
    const resources: Record<LedgerAttachmentObjectType, PermissionResourceValue> = {
      PROJECT: 'PROJECTS',
      CONTRACT: 'CONTRACTS',
      BANK_TRANSACTION: 'BANKING',
      INVOICE: 'INVOICES',
      MEMBERSHIP: 'MEMBERS',
    };
    assertPermission(user, resources[objectType], level);
    if (objectType === 'PROJECT' && level === 'EDIT') {
      const project = await this.prisma.project.findUnique({ where: { id: objectId }, select: { archiveStatus: true } });
      if (!project) throw new NotFoundException('项目不存在');
      if (project.archiveStatus === 'ARCHIVED') throw new BadRequestException('已归档项目不能修改附件');
    }
    if (user.role === 'PM') {
      const pmUserId = user.projectManagerId ?? '__unbound_pm__';
      const owned = objectType === 'PROJECT'
        ? await this.prisma.project.findFirst({ where: { id: objectId, pmUserId }, select: { id: true, archiveStatus: true } })
        : objectType === 'CONTRACT'
          ? await this.prisma.contract.findFirst({ where: { id: objectId, project: { pmUserId } }, select: { id: true } })
          : objectType === 'INVOICE'
            ? await this.prisma.invoice.findFirst({ where: { id: objectId, project: { pmUserId } }, select: { id: true } })
            : objectType === 'MEMBERSHIP'
              ? await this.prisma.membership.findFirst({ where: { id: objectId, pmUserId }, select: { id: true } })
              : await this.prisma.bankTransaction.findFirst({ where: { id: objectId, allocations: { some: { OR: [
              { project: { pmUserId } }, { expertProfile: { formOwnerId: pmUserId } }, { memberDue: { membership: { pmUserId } } },
            ] } } }, select: { id: true } });
      if (!owned) throw new NotFoundException('业务记录不存在或不属于当前 PM');
    }
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
    await this.localClient.putObject(this.localBucket, storageKey, file.buffer, file.size, { 'Content-Type': 'application/pdf' });
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
      await this.localClient.removeObject(this.localBucket, storageKey).catch(() => undefined);
      throw error;
    }
  }

  async initProjectMultipart(
    objectId: string,
    fileName: string,
    sizeBytes: number,
    headerBase64: string,
    actorUserId: string,
  ) {
    this.assertOssEnabled();
    await this.assertObjectExists('PROJECT', objectId);
    await this.assertAttachmentCapacity('PROJECT', objectId);
    const contentType = this.validateProjectAttachment(fileName, sizeBytes, Buffer.from(headerBase64, 'base64'));
    const extension = extname(fileName).toLowerCase();
    const storageKey = `${this.ossPrefix}/projects/${objectId}/${randomUUID()}${extension}`;
    const client = await this.createOssClient(this.ossInternalEndpoint);
    const initialized = await client.initMultipartUpload(storageKey, { mime: contentType });
    const payload: MultipartUploadToken = {
      version: 1,
      objectType: 'PROJECT',
      objectId,
      actorUserId,
      storageKey,
      uploadId: initialized.uploadId,
      fileName: fileName.slice(0, 255),
      contentType,
      sizeBytes,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    return {
      token: this.signUploadToken(payload),
      partSize: MULTIPART_PART_SIZE,
      partCount: Math.ceil(sizeBytes / MULTIPART_PART_SIZE),
      contentType,
    };
  }

  async createProjectPartUrl(objectId: string, token: string, partNumber: number, actorUserId: string) {
    const payload = this.verifyUploadToken(token, objectId, actorUserId);
    const partCount = Math.ceil(payload.sizeBytes / MULTIPART_PART_SIZE);
    if (partNumber > partCount) throw new BadRequestException('无效的附件分片编号');
    const client = await this.createOssClient(this.ossPublicEndpoint);
    const url = await client.asyncSignatureUrl(payload.storageKey, {
      method: 'PUT',
      expires: 15 * 60,
      'Content-Type': payload.contentType,
      subResource: { uploadId: payload.uploadId, partNumber },
    });
    return { url, contentType: payload.contentType };
  }

  async completeProjectMultipart(
    objectId: string,
    token: string,
    parts: Array<{ number: number; etag: string }>,
    actorUserId: string,
  ) {
    const payload = this.verifyUploadToken(token, objectId, actorUserId);
    await this.assertObjectExists('PROJECT', objectId);
    await this.assertAttachmentCapacity('PROJECT', objectId);
    const expectedParts = Math.ceil(payload.sizeBytes / MULTIPART_PART_SIZE);
    const sortedParts = parts
      .map((part) => ({ number: part.number, etag: part.etag.trim() }))
      .sort((left, right) => left.number - right.number);
    if (sortedParts.length !== expectedParts || sortedParts.some((part, index) => part.number !== index + 1 || !part.etag)) {
      throw new BadRequestException('附件分片不完整，无法完成上传');
    }

    const client = await this.createOssClient(this.ossInternalEndpoint);
    const completed = await client.completeMultipartUpload(payload.storageKey, payload.uploadId, sortedParts);
    try {
      const attachment = await this.prisma.attachment.create({
        data: {
          objectType: 'PROJECT',
          objectId,
          fileName: payload.fileName,
          storageKey: payload.storageKey,
          storageProvider: OSS_PROVIDER,
          contentType: payload.contentType,
          sizeBytes: BigInt(payload.sizeBytes),
          sha256: null,
          uploadedBy: actorUserId,
        },
        select: { id: true, objectId: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true },
      });
      await this.audit.record({
        actorUserId,
        action: 'UPLOAD',
        objectType: 'PROJECT',
        objectId,
        afterData: { attachmentId: attachment.id, fileName: attachment.fileName, storageProvider: OSS_PROVIDER, etag: completed.etag },
      });
      return serializeAttachment(attachment);
    } catch (error) {
      await client.delete(payload.storageKey).catch(() => undefined);
      throw error;
    }
  }

  async abortProjectMultipart(objectId: string, token: string, actorUserId: string) {
    const payload = this.verifyUploadToken(token, objectId, actorUserId);
    const client = await this.createOssClient(this.ossInternalEndpoint);
    await client.abortMultipartUpload(payload.storageKey, payload.uploadId).catch(() => undefined);
    return { aborted: true };
  }

  async getDownloadUrl(rawObjectType: string, objectId: string, attachmentId: string, actorUserId: string) {
    const objectType = this.parseObjectType(rawObjectType);
    await this.assertObjectExists(objectType, objectId);
    const attachment = await this.findAttachment(objectType, objectId, attachmentId);
    if (attachment.storageProvider !== OSS_PROVIDER) return { url: null };
    const client = await this.createOssClient(this.ossPublicEndpoint);
    const url = await client.asyncSignatureUrl(attachment.storageKey, {
      expires: 5 * 60,
      response: { 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}` },
    });
    await this.audit.record({
      actorUserId,
      action: 'DOWNLOAD',
      objectType,
      objectId,
      afterData: { attachmentId: attachment.id, fileName: attachment.fileName },
    });
    return { url };
  }

  async download(rawObjectType: string, objectId: string, attachmentId: string, actorUserId: string) {
    const objectType = this.parseObjectType(rawObjectType);
    await this.assertObjectExists(objectType, objectId);
    const attachment = await this.findAttachment(objectType, objectId, attachmentId);
    if (attachment.storageProvider === OSS_PROVIDER) throw new BadRequestException('OSS 附件请使用直链下载');
    await this.ensureBucket();
    const stream = await this.localClient.getObject(this.localBucket, attachment.storageKey);
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
    if (attachment.storageProvider === OSS_PROVIDER) {
      const client = await this.createOssClient(this.ossInternalEndpoint);
      await client.delete(attachment.storageKey);
    } else {
      await this.ensureBucket();
      await this.localClient.removeObject(this.localBucket, attachment.storageKey);
    }
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

  private validateProjectAttachment(fileName: string, sizeBytes: number, header: Buffer) {
    if (sizeBytes <= 0 || sizeBytes > PROJECT_ATTACHMENT_LIMIT) {
      throw new BadRequestException('项目附件大小必须在 5GB 以内');
    }
    const extension = extname(fileName).toLowerCase();
    const signatures: Record<string, { contentType: string; valid: (value: Buffer) => boolean }> = {
      '.pdf': { contentType: 'application/pdf', valid: (value) => value.subarray(0, 5).equals(Buffer.from('%PDF-')) },
      '.zip': { contentType: 'application/zip', valid: (value) => ['504b0304', '504b0506', '504b0708'].includes(value.subarray(0, 4).toString('hex')) },
      '.rar': { contentType: 'application/vnd.rar', valid: (value) => value.subarray(0, 6).equals(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) },
      '.7z': { contentType: 'application/x-7z-compressed', valid: (value) => value.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) },
    };
    const signature = signatures[extension];
    if (!signature || !signature.valid(header)) {
      throw new BadRequestException('项目附件仅支持有效的 PDF、ZIP、RAR 或 7Z 文件');
    }
    return signature.contentType;
  }

  private async assertAttachmentCapacity(objectType: LedgerAttachmentObjectType, objectId: string) {
    const attachmentCount = await this.prisma.attachment.count({ where: { objectType, objectId } });
    if (attachmentCount >= 10) throw new BadRequestException('每条业务记录最多上传 10 份附件');
  }

  private signUploadToken(payload: MultipartUploadToken) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.uploadTokenSecret).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  private verifyUploadToken(token: string, objectId: string, actorUserId: string) {
    const [encoded, suppliedSignature, extra] = token.split('.');
    if (!encoded || !suppliedSignature || extra) throw new BadRequestException('附件上传凭证无效');
    const expectedSignature = createHmac('sha256', this.uploadTokenSecret).update(encoded).digest();
    let supplied: Buffer;
    let payload: MultipartUploadToken;
    try {
      supplied = Buffer.from(suppliedSignature, 'base64url');
      payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as MultipartUploadToken;
    } catch {
      throw new BadRequestException('附件上传凭证无效');
    }
    if (supplied.length !== expectedSignature.length || !timingSafeEqual(supplied, expectedSignature)) {
      throw new BadRequestException('附件上传凭证无效');
    }
    if (
      payload.version !== 1
      || payload.objectType !== 'PROJECT'
      || payload.objectId !== objectId
      || payload.actorUserId !== actorUserId
      || payload.expiresAt < Date.now()
    ) {
      throw new BadRequestException('附件上传凭证无效或已过期');
    }
    return payload;
  }

  private assertOssEnabled() {
    if (!this.ossEnabled || !this.credentialClient) {
      throw new BadRequestException('项目大附件存储尚未启用');
    }
  }

  private async createOssClient(endpoint: string) {
    this.assertOssEnabled();
    const credentials = await this.credentialClient!.getCredential();
    const { accessKeyId, accessKeySecret, securityToken } = credentials;
    if (!accessKeyId || !accessKeySecret || !securityToken) throw new Error('无法获取 ECS RAM 角色临时凭证');
    return new OSS({
      accessKeyId,
      accessKeySecret,
      stsToken: securityToken,
      bucket: this.ossBucket,
      region: this.ossRegion,
      endpoint,
      secure: true,
      refreshSTSTokenInterval: 0,
      refreshSTSToken: async () => {
        const refreshed = await this.credentialClient!.getCredential();
        if (!refreshed.accessKeyId || !refreshed.accessKeySecret || !refreshed.securityToken) {
          throw new Error('无法刷新 ECS RAM 角色临时凭证');
        }
        return {
          accessKeyId: refreshed.accessKeyId,
          accessKeySecret: refreshed.accessKeySecret,
          stsToken: refreshed.securityToken,
        };
      },
    });
  }

  private async assertObjectExists(objectType: LedgerAttachmentObjectType, objectId: string) {
    const exists = objectType === 'PROJECT'
      ? await this.prisma.project.findUnique({ where: { id: objectId }, select: { id: true } })
      : objectType === 'CONTRACT'
        ? await this.prisma.contract.findUnique({ where: { id: objectId }, select: { id: true } })
        : objectType === 'BANK_TRANSACTION'
          ? await this.prisma.bankTransaction.findUnique({ where: { id: objectId }, select: { id: true } })
          : objectType === 'INVOICE'
            ? await this.prisma.invoice.findUnique({ where: { id: objectId }, select: { id: true } })
            : await this.prisma.membership.findUnique({ where: { id: objectId }, select: { id: true } });
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
        if (!await this.localClient.bucketExists(this.localBucket)) await this.localClient.makeBucket(this.localBucket);
      })().catch((error) => {
        this.bucketReady = undefined;
        throw error;
      });
    }
    return this.bucketReady;
  }
}
