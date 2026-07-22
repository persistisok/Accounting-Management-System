import { describe, expect, it, vi } from 'vitest';
import { SensitiveDataService } from './sensitive-data.service';

describe('SensitiveDataService', () => {
  it('decrypts values encrypted with the configured field key', () => {
    const config = { get: vi.fn((key: string) => key === 'FIELD_ENCRYPTION_KEY' ? 'test-field-key' : undefined) };
    const service = new SensitiveDataService(config as never);
    const encrypted = service.encrypt('110101199001011234');

    expect(encrypted).not.toContain('110101199001011234');
    expect(service.decrypt(encrypted)).toBe('110101199001011234');
  });

  it('returns undefined for an empty encrypted field', () => {
    const config = { get: vi.fn(() => 'test-field-key') };
    const service = new SensitiveDataService(config as never);

    expect(service.decrypt(null)).toBeUndefined();
  });
});
