import { withoutRoleFields } from './strip-role-response.interceptor';

describe('withoutRoleFields', () => {
  it('removes role properties recursively from objects and arrays', () => {
    const response = {
      user: { id: 'user-1', role: 'USER' },
      items: [{ id: 'item-1', metadata: { Role: 'VENDOR' } }],
      accessToken: 'opaque-token',
    };

    expect(withoutRoleFields(response)).toEqual({
      user: { id: 'user-1' },
      items: [{ id: 'item-1', metadata: {} }],
      accessToken: 'opaque-token',
    });
    expect(response.user.role).toBe('USER');
  });

  it('preserves date serialization while removing adjacent role fields', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const result = withoutRoleFields({ createdAt, role: 'ADMIN' });

    expect(result).toEqual({ createdAt });
    expect(JSON.stringify(result)).toContain('2026-01-01T00:00:00.000Z');
  });
});
