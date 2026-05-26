import { describe, expect, it } from 'vitest';
import { app } from '../../src/worker/index';

const env = { ADMIN_BOOTSTRAP_PASSWORD: 'yesasia' } as never;

describe('health route', () => {
  it('returns ok JSON', async () => {
    const res = await app.request('/api/health', {}, env);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
