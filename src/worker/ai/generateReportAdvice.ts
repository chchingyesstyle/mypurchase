import type { MonthlySummary } from '../reports/summary';

export type ReportAdvice = {
  overview: string;
  savingOpportunities: string[];
  budgetWarnings: string[];
  recurringNotes: string[];
  itemInsights: string[];
  nextMonthSuggestions: string[];
};

const REPORT_TEXT_MODEL = '@cf/meta/llama-3.1-8b-instruct';

const EMPTY_ADVICE: ReportAdvice = {
  overview: '',
  savingOpportunities: [],
  budgetWarnings: [],
  recurringNotes: [],
  itemInsights: [],
  nextMonthSuggestions: []
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stripJsonFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const firstObject = trimmed.indexOf('{');
  const lastObject = trimmed.lastIndexOf('}');
  if (firstObject >= 0 && lastObject > firstObject) return trimmed.slice(firstObject, lastObject + 1);
  return trimmed;
}

function responseText(response: unknown): string | null {
  if (typeof response === 'string') return response;
  const object = objectValue(response);
  for (const key of ['response', 'text', 'result', 'output']) {
    if (typeof object[key] === 'string') return object[key];
  }
  return null;
}

function hasAdviceShape(value: Record<string, unknown>) {
  return ['overview', 'savingOpportunities', 'budgetWarnings', 'recurringNotes', 'itemInsights', 'nextMonthSuggestions'].some((key) => key in value);
}

function parseAiJson(response: unknown): Record<string, unknown> {
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const direct = response as Record<string, unknown>;
    if (!('response' in direct) && !('text' in direct) && !('result' in direct) && !('output' in direct)) {
      if (!hasAdviceShape(direct)) throw new Error('AI report advice had no expected fields');
      return direct;
    }
  }

  const text = responseText(response);
  if (!text) throw new Error("AI report advice was not JSON");

  try {
    const parsed = objectValue(JSON.parse(stripJsonFence(text)));
    if (!hasAdviceShape(parsed)) throw new Error("AI report advice had no expected fields");
    return parsed;
  } catch {
    throw new Error("AI report advice was not valid JSON");
  }
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanList(value: unknown) {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean).slice(0, 12) : [];
}

function normalizeAdvice(value: unknown): ReportAdvice {
  const advice = objectValue(value);
  return {
    overview: cleanText(advice.overview),
    savingOpportunities: cleanList(advice.savingOpportunities),
    budgetWarnings: cleanList(advice.budgetWarnings),
    recurringNotes: cleanList(advice.recurringNotes),
    itemInsights: cleanList(advice.itemInsights),
    nextMonthSuggestions: cleanList(advice.nextMonthSuggestions)
  };
}

export async function generateReportAdvice(ai: Ai, summary: MonthlySummary): Promise<ReportAdvice> {
  const prompt =
    'You are analyzing one user shopping summary. Return JSON only with keys overview, savingOpportunities, budgetWarnings, recurringNotes, itemInsights, nextMonthSuggestions. Use short practical advice. Summary JSON: ' +
    JSON.stringify(summary);

  const response = await (ai.run as (...args: unknown[]) => Promise<unknown>)(REPORT_TEXT_MODEL, { prompt });
  return { ...EMPTY_ADVICE, ...normalizeAdvice(parseAiJson(response)) };
}
