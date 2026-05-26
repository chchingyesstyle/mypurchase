import { Hono } from 'hono';
import type { AppEnv } from './env';
import { authRoutes } from './routes/auth';

export const app = new Hono<{ Bindings: AppEnv }>();

app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api/auth', authRoutes);

app.get('*', async (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
