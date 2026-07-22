import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

@Injectable()
export class SensitiveDataService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const material = config.get<string>('FIELD_ENCRYPTION_KEY')
      ?? config.get<string>('JWT_SECRET', 'development-only-change-this-secret');
    this.key = createHash('sha256').update(material).digest();
  }

  encrypt(value?: string) {
    if (!value) return undefined;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
  }

  decrypt(value?: string | null) {
    if (!value) return undefined;
    const [ivValue, tagValue, encryptedValue] = value.split('.');
    if (!ivValue || !tagValue || !encryptedValue) throw new Error('敏感字段密文格式无效');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivValue, 'base64'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64')), decipher.final()]).toString('utf8');
  }

  hash(value?: string) {
    if (!value) return undefined;
    return createHash('sha256').update(this.key).update(value.trim()).digest('hex');
  }

  maskPhone(value?: string) {
    if (!value) return undefined;
    return value.replace(/^(\d{3})\d+(\d{4})$/, '$1****$2');
  }

  maskId(value?: string) {
    if (!value) return undefined;
    if (value.length < 8) return '****';
    return `${value.slice(0, 3)}${'*'.repeat(Math.max(4, value.length - 7))}${value.slice(-4)}`;
  }

  maskBank(value?: string) {
    if (!value) return undefined;
    return `**** **** **** ${value.slice(-4)}`;
  }
}
