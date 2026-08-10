import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ROLES_KEY } from '../auth/roles.decorator';
import { ExportsController } from './exports.controller';

describe('ExportsController permissions', () => {
  it('restricts filtered exports to system administrators', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ExportsController)).toEqual(['SYSTEM_ADMIN']);
  });
});
