export type ExtractedReceiptLine = {
  name: string;
  quantity: number | string | null;
  unitPrice: number | string | null;
  totalPrice: number | string | null;
  categoryName: string | null;
  categoryHint: string | null;
};

export type ExtractedReceiptDraft = {
  merchant: string;
  purchaseDate: string;
  currency: string;
  subtotal: number | string | null;
  tax: number | string | null;
  discount: number | string | null;
  total: number | string | null;
  categoryName: string | null;
  categoryHint: string | null;
  notes: string | null;
  items: ExtractedReceiptLine[];
};

const RECEIPT_VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

const EMPTY_DRAFT: ExtractedReceiptDraft = {
  merchant: '',
  purchaseDate: '',
  currency: '',
  subtotal: null,
  tax: null,
  discount: null,
  total: null,
  categoryName: null,
  categoryHint: null,
  notes: null,
  items: []
};

function cleanString(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function nullableString(value: unknown) {
  const text = cleanString(value);
  return text === '' ? null : text;
}

function maybeMoney(value: unknown) {
  if (typeof value === 'number' || typeof value === 'string') return value;
  return null;
}

function maybeQuantity(value: unknown) {
  if (typeof value === 'number' || typeof value === 'string') return value;
  return null;
}

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

function parseAiJson(response: unknown): Record<string, unknown> {
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const direct = response as Record<string, unknown>;
    if (!('response' in direct) && !('text' in direct) && !('result' in direct) && !('output' in direct)) return direct;
  }

  const text = responseText(response);
  if (!text) return {};

  try {
    return objectValue(JSON.parse(stripJsonFence(text)));
  } catch {
    return {};
  }
}

function normalizeItem(value: unknown): ExtractedReceiptLine {
  const item = objectValue(value);
  return {
    name: cleanString(item.name),
    quantity: maybeQuantity(item.quantity),
    unitPrice: maybeMoney(item.unitPrice),
    totalPrice: maybeMoney(item.totalPrice),
    categoryName: nullableString(item.categoryName),
    categoryHint: nullableString(item.categoryHint)
  };
}

function normalizeDraft(value: unknown): ExtractedReceiptDraft {
  const draft = objectValue(value);
  const items = Array.isArray(draft.items) ? draft.items.map(normalizeItem) : [];
  return {
    merchant: cleanString(draft.merchant),
    purchaseDate: cleanString(draft.purchaseDate),
    currency: cleanString(draft.currency),
    subtotal: maybeMoney(draft.subtotal),
    tax: maybeMoney(draft.tax),
    discount: maybeMoney(draft.discount),
    total: maybeMoney(draft.total),
    categoryName: nullableString(draft.categoryName),
    categoryHint: nullableString(draft.categoryHint),
    notes: nullableString(draft.notes),
    items
  };
}

export async function extractReceiptDraft(ai: Ai, imageBytes: Uint8Array, mimeType: string): Promise<ExtractedReceiptDraft> {
  const response = await (ai.run as (...args: unknown[]) => Promise<unknown>)(RECEIPT_VISION_MODEL, {
    image: Array.from(imageBytes),
    mimeType,
    prompt:
      'Extract receipt data as JSON only. Include merchant, purchaseDate, currency, subtotal, tax, discount, total, categoryName, categoryHint, notes, and items with name, quantity, unitPrice, totalPrice, categoryName, categoryHint. Use null for unknown values.'
  });
  return { ...EMPTY_DRAFT, ...normalizeDraft(parseAiJson(response)) };
}
