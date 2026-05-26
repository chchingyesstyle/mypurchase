import { Hono } from 'hono';
import type { AppEnv } from './env';

export const app = new Hono<{ Bindings: AppEnv }>();

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('*', async (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
