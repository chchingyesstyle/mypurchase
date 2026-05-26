import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../env";
import { extractReceiptDraft, type ExtractedReceiptDraft } from "../ai/extractReceipt";
import { requireCsrf, requireUser } from "../security/sessions";

export const extractionRoutes = new Hono<{ Bindings: AppEnv }>();

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function badRequest(message = "Invalid request"): never {
  throw new HTTPException(400, { message });
}

function payloadTooLarge(): never {
  throw new HTTPException(413, { message: "Receipt image is too large" });
}

function cleanText(value: string | null) {
  if (value === null) return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function normalizeCurrency(value: string) {
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "USD";
}

function normalizeDate(value: string) {
  const date = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const parsed = new Date(date + "T00:00:00.000Z");
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date ? date : "";
}

function moneyToMinorUnits(value: number | string | null) {
  if (value === null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100);
  }

  const normalized = value.trim().replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const sign = normalized.startsWith("-") ? -1 : 1;
  const unsigned = normalized.replace(/^-/, "");
  const [dollars, cents = ""] = unsigned.split(".");
  const minorUnits = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  if (!Number.isSafeInteger(minorUnits)) return null;
  return sign * minorUnits;
}

function normalizeQuantity(value: number | string | null) {
  if (value === null) return 1;
  const quantity = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function normalizeDraft(draft: ExtractedReceiptDraft) {
  return {
    merchant: draft.merchant.trim(),
    purchaseDate: normalizeDate(draft.purchaseDate),
    currency: normalizeCurrency(draft.currency),
    subtotal: moneyToMinorUnits(draft.subtotal),
    tax: moneyToMinorUnits(draft.tax),
    discount: moneyToMinorUnits(draft.discount),
    total: moneyToMinorUnits(draft.total),
    categoryName: cleanText(draft.categoryName),
    categoryHint: cleanText(draft.categoryHint),
    notes: cleanText(draft.notes),
    sourceType: "receipt_image",
    items: draft.items.map((item) => ({
      name: item.name.trim(),
      quantity: normalizeQuantity(item.quantity),
      unitPrice: moneyToMinorUnits(item.unitPrice),
      totalPrice: moneyToMinorUnits(item.totalPrice),
      categoryName: cleanText(item.categoryName),
      categoryHint: cleanText(item.categoryHint)
    }))
  };
}

extractionRoutes.post("/extract-receipt", async (c) => {
  await requireCsrf(c, await requireUser(c));

  const body = await c.req.parseBody().catch(() => null);
  const receipt = body?.receipt;
  if (!(receipt instanceof File)) badRequest("Receipt image is required");
  if (receipt.size > MAX_RECEIPT_BYTES) payloadTooLarge();
  if (!SUPPORTED_IMAGE_TYPES.has(receipt.type)) badRequest("Unsupported receipt image type");

  const imageBytes = new Uint8Array(await receipt.arrayBuffer());
  const draft = await extractReceiptDraft(c.env.AI, imageBytes, receipt.type);
  return c.json({ draft: normalizeDraft(draft) });
});
