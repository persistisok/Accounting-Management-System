import { describe, expect, it } from 'vitest';
import { normalizeOrganizationName } from './organizations.service';

describe('normalizeOrganizationName', () => {
  it('normalizes spaces and bracket variants for duplicate checks', () => {
    expect(normalizeOrganizationName('远川（上海） 医学中心')).toBe(normalizeOrganizationName('远川(上海)医学中心'));
  });
});
