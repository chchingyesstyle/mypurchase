import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { createUser, findUserByUsername, listUsersForAdmin, type UserWithPassword } from '../repositories/users';
import { hashPassword } from '../security/passwords';
import { requireAdmin, requireCsrf } from '../security/sessions';

export const usersRoutes = new Hono<{ Bindings: AppEnv }>();

const createUserSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(8),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  role: z.enum(['admin', 'user']).default('user')
});

function publicUser(user: UserWithPassword) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

function badRequest(message = 'Invalid request'): never {
  throw new HTTPException(400, { message });
}

usersRoutes.get('/', async (c) => {
  await requireAdmin(c);
  const users = await listUsersForAdmin(c.env.DB);
  return c.json({ users: users.map(publicUser) });
});

usersRoutes.post('/', async (c) => {
  const session = await requireAdmin(c);
  await requireCsrf(c, session);

  const body = await c.req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) badRequest();
  const input = parsed.data;

  if (input.username === 'admin') {
    throw new HTTPException(409, { message: 'Admin username is reserved for bootstrap' });
  }

  const existing = await findUserByUsername(c.env.DB, input.username);
  if (existing) throw new HTTPException(409, { message: 'Username already exists' });

  const user = await createUser(c.env.DB, {
    username: input.username,
    passwordHash: await hashPassword(input.password),
    role: input.role,
    defaultCurrency: input.defaultCurrency
  });
  if (!user) throw new Error('Failed to create user');

  return c.json({ user: publicUser(user) }, 201);
});
