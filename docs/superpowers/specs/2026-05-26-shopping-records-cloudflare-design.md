# Shopping Records Cloudflare App Design

Date: 2026-05-26

## Summary

Build a multi-user shopping records web app hosted on Cloudflare. Users upload supermarket or online-shopping receipt images, review AI-extracted receipt details and line items, save confirmed records to Cloudflare D1, and generate on-demand monthly AI spending reports.

The MVP uses Cloudflare Workers, D1, and Workers AI. It does not require R1. Uploaded receipt images are processed only during the active request/session and are discarded after extraction. Only confirmed structured records are stored.

## Goals

- Record shopping receipts with merchant, date, total, tax, discount, currency, category, notes, and item lines.
- Use Workers AI to extract receipt data from uploaded images.
- Let users edit AI extraction results before saving.
- Support multiple users from the start with strict data isolation.
- Use username/password auth with an admin bootstrap flow.
- Generate full on-demand monthly reports with trends, budgets, recurring purchases, item insights, and advice.
- Fit Cloudflare Free plan constraints as closely as practical.

## Non-Goals

- Store original receipt images.
- Use R1 in version 1.
- Support public self-registration.
- Auto-generate scheduled monthly reports in version 1.
- Support multi-currency exchange-rate normalization in version 1.
- Parse arbitrary retailer links in version 1.

## Cloudflare Platform Constraints

Current Cloudflare docs, checked on 2026-05-26:

- Workers Free: 100,000 requests/day, 10 ms CPU per request, 128 MB memory, 50 external subrequests/request, 1,000 internal Cloudflare service subrequests/request, 100 MB request body limit on the Cloudflare account Free plan.
- D1 Free: 5 million rows read/day, 100,000 rows written/day, 5 GB total storage, 500 MB max per database, 50 queries per Worker invocation.
- Workers AI Free: 10,000 neurons/day, then operations fail unless upgraded to Workers Paid.
- Workers AI rate limits vary by task type. Image-to-text is documented at 720 requests/minute, text generation at 300 requests/minute, with lower per-model limits possible.

Sources:

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/platform/limits/

## Architecture

Use a single Cloudflare Worker project that serves both frontend static assets and API routes from the same origin.

Bindings:

- `DB`: Cloudflare D1 database.
- `AI`: Cloudflare Workers AI binding.

No R1 binding is required.

The frontend uploads a receipt image to the Worker. The Worker validates file type and size, sends the image to Workers AI for extraction, returns a structured draft, and discards the image. The user edits the draft in the browser and saves confirmed data to D1.

Reports are generated on demand. The Worker queries D1 for the authenticated user's month data, creates deterministic numeric summaries first, then sends a compact summary to Workers AI for narrative advice. The generated report can be cached in D1 and invalidated when that user's records for the month change.

The API shape should leave room for future async processing with Cloudflare Queues, but Queues are not required for v1.

## Auth Model

There is no public self-registration in v1.

The first user is the bootstrap admin:

- Username: `admin`
- Bootstrap password source: Cloudflare secret `ADMIN_BOOTSTRAP_PASSWORD`
- Intended initial secret value: `yesasia`

The password must not be committed to code or config. It should be set with:

```bash
wrangler secret put ADMIN_BOOTSTRAP_PASSWORD
```

After bootstrap login or first admin creation, the app stores only a password hash in D1. The environment secret is used only when no admin user exists, or when an explicit recovery endpoint is enabled for a local/admin maintenance session.

Admin users can create additional users with usernames and passwords. Every user has an internal `user_id`, and all receipts, items, categories, budgets, sessions, and reports are scoped by `user_id`.

Sessions use HttpOnly, Secure, SameSite cookies. Mutating routes require CSRF protection.

## Product Scope

### Upload And Review

Users upload one receipt image. The image is session/request scoped and not persisted. AI extraction produces an editable draft:

- merchant
- purchase date
- currency
- total
- subtotal
- tax
- discount
- category
- notes
- item lines

Users can edit, add, or delete line items before saving.

### Records

Users can browse, filter, view, edit, and delete their own saved receipts. Filters include month, merchant, category, amount range, and text search where practical.

### Reports

Users generate monthly reports on demand. The report includes:

- total spend
- category breakdown
- merchant breakdown
- month-over-month trends where previous data exists
- budget progress
- recurring purchases
- item-level insights
- unusual spending
- AI recommendations

Numeric totals and deterministic summaries must remain visible next to AI commentary. AI advice is advisory, not authoritative.

### Settings

Users manage:

- profile and password
- default currency
- categories
- monthly budgets

Admin users additionally manage users.

## Frontend Design Direction

This is a product UI. The first authenticated screen should be the working dashboard, not a landing page.

Design principles:

- Restrained light UI with tinted neutrals.
- One primary accent color for important actions and selected states.
- Left navigation on desktop.
- Compact top or bottom navigation on mobile.
- Dense but readable tables for records and items.
- Upload/review screen optimized for correction speed.
- Report screen combines charts, tables, and short advice blocks.
- AI-generated data is always reviewable before saving.

Primary screens:

- login
- dashboard
- upload receipt
- review extracted receipt
- records list
- receipt detail/edit
- monthly report
- categories
- budgets
- admin user management
- settings

## Data Model

Core tables:

- `users`
  - `id`
  - `username`
  - `password_hash`
  - `role` (`admin` or `user`)
  - `default_currency`
  - `created_at`
  - `updated_at`
- `sessions`
  - `id`
  - `user_id`
  - `token_hash`
  - `csrf_token_hash`
  - `expires_at`
  - `created_at`
- `categories`
  - `id`
  - `user_id` nullable for built-in categories
  - `name`
  - `kind`
  - `color`
  - `icon`
  - `created_at`
- `receipts`
  - `id`
  - `user_id`
  - `merchant`
  - `purchase_date`
  - `currency`
  - `subtotal`
  - `tax`
  - `discount`
  - `total`
  - `category_id`
  - `notes`
  - `source_type`
  - `created_at`
  - `updated_at`
- `receipt_items`
  - `id`
  - `receipt_id`
  - `user_id`
  - `name`
  - `quantity`
  - `unit_price`
  - `total_price`
  - `category_id`
  - `created_at`
- `budgets`
  - `id`
  - `user_id`
  - `category_id`
  - `month`
  - `currency`
  - `amount`
  - `created_at`
  - `updated_at`
- `monthly_reports`
  - `id`
  - `user_id`
  - `month`
  - `summary_json`
  - `ai_advice_json`
  - `records_version`
  - `created_at`
  - `updated_at`
- `user_month_versions`
  - `id`
  - `user_id`
  - `month`
  - `records_version`
  - `updated_at`
- `audit_log`
  - `id`
  - `user_id`
  - `action`
  - `entity_type`
  - `entity_id`
  - `created_at`

Important indexes:

- `users.username` unique
- `sessions.token_hash`
- `receipts(user_id, purchase_date)`
- `receipts(user_id, merchant)`
- `receipts(user_id, category_id)`
- `receipt_items(user_id, receipt_id)`
- `receipt_items(user_id, category_id)`
- `budgets(user_id, month, category_id)`
- `monthly_reports(user_id, month)` unique
- `user_month_versions(user_id, month)` unique

## Security Requirements

- Do not store plaintext passwords.
- Do not commit bootstrap password values.
- Hash session tokens before storing them.
- Set cookies as HttpOnly, Secure, SameSite.
- Validate CSRF tokens on mutating requests.
- Validate uploaded image MIME type and size.
- Avoid persisting original image bytes.
- Scope every D1 query by authenticated `user_id`, except admin-only user management and built-in category reads.
- Admin routes require `role = 'admin'`.
- AI prompts receive only the authenticated user's relevant data or summaries.
- Never trust AI-extracted totals without user confirmation.
- Password hashing uses WebCrypto PBKDF2 with a per-user random salt, a versioned iteration count, and constant-time hash comparison where possible in the Workers runtime.

## Error Handling

- If AI extraction fails, show manual entry fields with a clear retry option.
- If extraction confidence is low or fields are missing, mark those fields for review.
- If D1 limits or AI limits are hit, show a practical error and preserve the user's unsaved draft in browser state where possible.
- If report generation fails, keep deterministic numeric summaries visible and let the user retry AI advice later.
- If a user edits records for a month, increment `user_month_versions.records_version` for that user's month. Cached reports are valid only when their `records_version` matches the current month version.

## Testing Plan

API and data tests:

- admin bootstrap behavior
- login/logout/session expiry
- password change
- admin user creation
- user isolation for all receipt, item, category, budget, and report routes
- receipt CRUD
- item CRUD
- category custom and built-in behavior
- budget CRUD
- report cache invalidation
- uploaded image validation

Frontend tests:

- login flow
- upload receipt flow
- extraction success and failure states
- review/edit/save receipt flow
- records filtering
- report generation states
- admin user management
- responsive desktop/mobile layout checks

Manual verification:

- Deploy locally with Wrangler.
- Test on desktop and mobile viewport widths.
- Verify no original image bytes are saved to D1.
- Verify D1 queries use indexes for report and record list paths.

## Implementation Defaults

- Receipt extraction uses the currently available Workers AI image-to-text or vision-capable model that can accept receipt images and return structured JSON. The implementation must isolate model choice behind one AI extraction adapter so the model can be replaced without changing route or UI code.
- Monthly report advice uses the lowest-cost Workers AI text-generation model that can reliably produce JSON advice from deterministic summaries. The implementation must isolate model choice behind one report-advice adapter.
- Built-in starter categories are seeded by D1 migration, not by application startup.
- Report cache invalidation uses `user_month_versions.records_version`.
- Receipt and receipt-item category references use `ON DELETE SET NULL` so deleting a custom category does not delete historical purchase records.
