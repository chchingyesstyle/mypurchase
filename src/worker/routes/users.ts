import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { countAdmins, createUser, deleteUser, findUserById, findUserByUsername, listUsersForAdmin, type UserWithPassword, updateUserPassword } from '../repositories/users';
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

const changePasswordSchema = z.object({
  password: z.string().min(8)
});

usersRoutes.patch('/:id/password', async (c) => {
  const session = await requireAdmin(c);
  await requireCsrf(c, session);

  const userId = c.req.param('id');
  const user = await findUserById(c.env.DB, userId);
  if (!user) throw new HTTPException(404, { message: 'User not found' });

  const body = await c.req.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) badRequest();

  await updateUserPassword(c.env.DB, userId, await hashPassword(parsed.data.password));
  return c.json({ ok: true });
});

usersRoutes.delete('/:id', async (c) => {
  const session = await requireAdmin(c);
  await requireCsrf(c, session);

  const userId = c.req.param('id');
  const user = await findUserById(c.env.DB, userId);
  if (!user) throw new HTTPException(404, { message: 'User not found' });

  if (user.role === 'admin') {
    const adminCount = await countAdmins(c.env.DB);
    if (adminCount <= 1) throw new HTTPException(409, { message: 'Cannot delete the last admin' });
  }

  await deleteUser(c.env.DB, userId);
  return c.body(null, 204);
});
