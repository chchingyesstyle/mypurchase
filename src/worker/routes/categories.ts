import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../env';
import {
  createCustomCategory,
  deleteOwnedCustomCategory,
  listVisibleCategories,
  updateOwnedCustomCategory
} from '../repositories/categories';
import { requireCsrf, requireUser } from '../security/sessions';

export const categoriesRoutes = new Hono<{ Bindings: AppEnv }>();

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const iconSchema = z.string().trim().min(1).max(64);
const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: colorSchema,
  icon: iconSchema
});
const updateCategorySchema = createCategorySchema.partial().refine((input) => Object.keys(input).length > 0);

function badRequest(message = 'Invalid request'): never {
  throw new HTTPException(400, { message });
}

function notFound(): never {
  throw new HTTPException(404, { message: 'Category not found' });
}

function routeParam(value: string | undefined): string {
  if (!value) badRequest();
  return value;
}

categoriesRoutes.get('/', async (c) => {
  const session = await requireUser(c);
  const categories = await listVisibleCategories(c.env.DB, session.user.id);
  return c.json({ categories });
});

categoriesRoutes.post('/', async (c) => {
  const session = await requireCsrf(c, await requireUser(c));
  const body = await c.req.json().catch(() => null);
  const parsed = createCategorySchema.safeParse(body);
  if (!parsed.success) badRequest();

  const category = await createCustomCategory(c.env.DB, { userId: session.user.id, ...parsed.data });
  return c.json({ category }, 201);
});

categoriesRoutes.patch('/:id', async (c) => {
  const session = await requireCsrf(c, await requireUser(c));
  const body = await c.req.json().catch(() => null);
  const parsed = updateCategorySchema.safeParse(body);
  if (!parsed.success) badRequest();

  const category = await updateOwnedCustomCategory(c.env.DB, session.user.id, routeParam(c.req.param('id')), parsed.data);
  if (!category) notFound();
  return c.json({ category });
});

categoriesRoutes.delete('/:id', async (c) => {
  const session = await requireCsrf(c, await requireUser(c));
  const deleted = await deleteOwnedCustomCategory(c.env.DB, session.user.id, routeParam(c.req.param('id')));
  if (!deleted) notFound();
  return c.json({ ok: true });
});
