import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { generateReportAdvice } from '../ai/generateReportAdvice';
import type { AppEnv } from '../env';
import { getCurrentCachedReport, getCurrentRecordsVersion, getReportData, saveMonthlyReport } from '../repositories/reports';
import { buildMonthlySummary } from '../reports/summary';
import { requireCsrf, requireUser } from '../security/sessions';

export const reportsRoutes = new Hono<{ Bindings: AppEnv }>();

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

function parseMonth(value: string | undefined) {
  const parsed = monthSchema.safeParse(value);
  if (!parsed.success) throw new HTTPException(400, { message: 'Invalid month' });
  return parsed.data;
}

reportsRoutes.get('/:month', async (c) => {
  const session = await requireUser(c);
  const month = parseMonth(c.req.param('month'));
  const report = await getCurrentCachedReport(c.env.DB, session.user.id, month);
  if (!report) throw new HTTPException(404, { message: 'Report not found' });
  return c.json({ report });
});

reportsRoutes.post('/:month/generate', async (c) => {
  const session = await requireCsrf(c, await requireUser(c));
  const month = parseMonth(c.req.param('month'));
  const data = await getReportData(c.env.DB, session.user.id, month);
  const summary = buildMonthlySummary(data);
  const recordsVersion = await getCurrentRecordsVersion(c.env.DB, session.user.id, month);

  try {
    const advice = await generateReportAdvice(c.env.AI, summary);
    const report = await saveMonthlyReport(c.env.DB, { userId: session.user.id, month, summary, advice, recordsVersion });
    return c.json({ report });
  } catch {
    return c.json({
      report: {
        id: null,
        userId: session.user.id,
        month,
        summary,
        advice: null,
        recordsVersion,
        aiStatus: 'failed',
        createdAt: null,
        updatedAt: null
      }
    });
  }
});
