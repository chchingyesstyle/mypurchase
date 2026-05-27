import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const adminBootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;

test.skip(!adminBootstrapPassword, 'ADMIN_BOOTSTRAP_PASSWORD must be set for e2e bootstrap login.');

async function signIn(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  await page.getByLabel(/username/i).fill('admin');
  await page.getByLabel(/password/i).fill(adminBootstrapPassword ?? '');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
}

test('admin bootstrap login works and primary pages load', async ({ page }) => {
  await signIn(page);

  await page.getByRole('link', { name: /^upload$/i }).first().click();
  await expect(page.getByRole('heading', { name: /upload receipt/i })).toBeVisible();

  await page.getByRole('link', { name: /^records$/i }).first().click();
  await expect(page.getByRole('heading', { name: /records/i })).toBeVisible();

  await page.getByRole('link', { name: /^reports$/i }).first().click();
  await expect(page.getByRole('heading', { name: /monthly report/i })).toBeVisible();

  await page.getByRole('link', { name: /^settings$/i }).first().click();
  await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
});

test('mobile viewport keeps primary navigation usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  await page.getByRole('link', { name: /^reports$/i }).last().click();
  await expect(page.getByRole('heading', { name: /monthly report/i })).toBeVisible();

  await page.getByRole('link', { name: /^settings$/i }).last().click();
  await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
});
