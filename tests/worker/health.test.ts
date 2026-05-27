import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../../src/worker/env';
import { app } from '../../src/worker/index';

function unusedBinding<T>(name: string): T {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(`${name} binding is not available in this test`);
      }
    }
  ) as T;
}

const env: AppEnv = {
  ADMIN_BOOTSTRAP_PASSWORD: 'bootstrap-secret',
  APP_ENV: 'test',
  ASSETS: unusedBinding<Fetcher>('ASSETS'),
  AI: unusedBinding<Ai>('AI'),
  DB: unusedBinding<D1Database>('DB')
};

describe('health route', () => {
  it('returns ok JSON', async () => {
    const res = await app.request('/api/health', {}, env);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
