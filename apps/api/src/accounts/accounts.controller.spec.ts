import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ROLES_KEY } from '../auth/roles.decorator';
import { AccountsController } from './accounts.controller';

describe('AccountsController permissions', () => {
  it('restricts account management to system administrators', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AccountsController)).toEqual(['SYSTEM_ADMIN']);
  });
});
