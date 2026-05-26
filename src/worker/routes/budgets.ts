import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { deleteBudget, listBudgetsByMonth, upsertBudget } from '../repositories/budgets';
import { requireCsrf, requireUser } from '../security/sessions';

export const budgetsRoutes = new Hono<{ Bindings: AppEnv }>();

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const budgetBodySchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: currencySchema
});

function badRequest(message = 'Invalid request'): never {
  throw new HTTPException(400, { message });
}

function notFound(): never {
  throw new HTTPException(404, { message: 'Budget not found' });
}

function routeParam(value: string | undefined): string {
  if (!value) badRequest();
  return value;
}

function parseMonth(value: unknown) {
  const parsed = monthSchema.safeParse(value);
  if (!parsed.success) badRequest('Invalid month');
  return parsed.data;
}

budgetsRoutes.get('/', async (c) => {
  const session = await requireUser(c);
  const month = parseMonth(c.req.query('month'));
  const budgets = await listBudgetsByMonth(c.env.DB, session.user.id, month);
  return c.json({ budgets });
});

budgetsRoutes.put('/:categoryId/:month', async (c) => {
  const session = await requireCsrf(c, await requireUser(c));
  const month = parseMonth(c.req.param('month'));
  const body = await c.req.json().catch(() => null);
  const parsed = budgetBodySchema.safeParse(body);
  if (!parsed.success) badRequest();

  const budget = await upsertBudget(c.env.DB, {
    userId: session.user.id,
    categoryId: routeParam(c.req.param('categoryId')),
    month,
    ...parsed.data
  });
  if (!budget) notFound();
  return c.json({ budget });
});

budgetsRoutes.delete('/:categoryId/:month', async (c) => {
  const session = await requireCsrf(c, await requireUser(c));
  const month = parseMonth(c.req.param('month'));
  const deleted = await deleteBudget(c.env.DB, session.user.id, routeParam(c.req.param('categoryId')), month);
  if (deleted !== true) notFound();
  return c.json({ ok: true });
});
