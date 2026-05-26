import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../env";
import {
  createReceipt,
  deleteReceipt,
  getReceiptDetail,
  listReceipts,
  updateReceipt,
  type ReceiptInput,
  type ReceiptItemInput
} from "../repositories/receipts";
import { requireCsrf, requireUser } from "../security/sessions";

export const receiptsRoutes = new Hono<{ Bindings: AppEnv }>();

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const sourceTypeSchema = z.enum(["manual", "receipt_image"]);
const moneySchema = z.number().int().nonnegative();
const textFilterSchema = z.string().trim().min(1).max(100).optional();
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + "T00:00:00.000Z");
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  });

const receiptItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().positive(),
  unitPrice: moneySchema,
  totalPrice: moneySchema,
  categoryId: z.string().trim().min(1).max(128).nullable().optional()
});

const receiptBodySchema = z.object({
  merchant: z.string().trim().min(1).max(200),
  purchaseDate: dateSchema,
  currency: currencySchema,
  subtotal: moneySchema.nullable().optional(),
  tax: moneySchema.nullable().optional(),
  discount: moneySchema.nullable().optional(),
  total: moneySchema,
  categoryId: z.string().trim().min(1).max(128).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  sourceType: sourceTypeSchema,
  items: z.array(receiptItemSchema).max(200).default([])
});

function badRequest(message = "Invalid request"): never {
  throw new HTTPException(400, { message });
}

function notFound(): never {
  throw new HTTPException(404, { message: "Receipt not found" });
}

function routeParam(value: string | undefined): string {
  if (!value) badRequest();
  return value;
}

function parseMonth(value: string | undefined) {
  if (value === undefined) return undefined;
  const parsed = monthSchema.safeParse(value);
  if (!parsed.success) badRequest("Invalid month");
  return parsed.data;
}

function parseBoundedInteger(value: string | undefined, options: { defaultValue: number; min: number; max: number; name: string }) {
  if (value === undefined) return options.defaultValue;
  if (!/^\d+$/.test(value)) badRequest("Invalid " + options.name);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < options.min || parsed > options.max) badRequest("Invalid " + options.name);
  return parsed;
}

function parseTextFilter(value: string | undefined, name: string) {
  const parsed = textFilterSchema.safeParse(value);
  if (!parsed.success) badRequest("Invalid " + name);
  return parsed.data;
}

function receiptInput(data: z.infer<typeof receiptBodySchema>): ReceiptInput {
  return {
    ...data,
    categoryId: data.categoryId ?? null,
    notes: data.notes ?? null,
    items: data.items.map(
      (item): ReceiptItemInput => ({
        ...item,
        categoryId: item.categoryId ?? null
      })
    )
  };
}

receiptsRoutes.get("/", async (c) => {
  const session = await requireUser(c);
  const receipts = await listReceipts(c.env.DB, session.user.id, {
    month: parseMonth(c.req.query("month")),
    merchant: parseTextFilter(c.req.query("merchant"), "merchant"),
    categoryId: c.req.query("categoryId"),
    q: parseTextFilter(c.req.query("q"), "q"),
    limit: parseBoundedInteger(c.req.query("limit"), { defaultValue: 50, min: 1, max: 100, name: "limit" }),
    offset: parseBoundedInteger(c.req.query("offset"), { defaultValue: 0, min: 0, max: 100000, name: "offset" })
  });
  return c.json({ receipts });
});

receiptsRoutes.post("/", async (c) => {
  const session = await requireCsrf(c, await requireUser(c));
  const body = await c.req.json().catch(() => null);
  const parsed = receiptBodySchema.safeParse(body);
  if (!parsed.success) badRequest();

  const receipt = await createReceipt(c.env.DB, session.user.id, receiptInput(parsed.data));
  if (!receipt) notFound();
  return c.json({ receipt }, 201);
});

receiptsRoutes.get("/:id", async (c) => {
  const session = await requireUser(c);
  const receipt = await getReceiptDetail(c.env.DB, session.user.id, routeParam(c.req.param("id")));
  if (!receipt) notFound();
  return c.json({ receipt });
});

receiptsRoutes.put("/:id", async (c) => {
  const session = await requireCsrf(c, await requireUser(c));
  const body = await c.req.json().catch(() => null);
  const parsed = receiptBodySchema.safeParse(body);
  if (!parsed.success) badRequest();

  const receipt = await updateReceipt(c.env.DB, session.user.id, routeParam(c.req.param("id")), receiptInput(parsed.data));
  if (!receipt) notFound();
  return c.json({ receipt });
});

receiptsRoutes.delete("/:id", async (c) => {
  const session = await requireCsrf(c, await requireUser(c));
  const deleted = await deleteReceipt(c.env.DB, session.user.id, routeParam(c.req.param("id")));
  if (!deleted) notFound();
  return c.json({ ok: true });
});
