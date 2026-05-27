import { defineConfig } from '@playwright/test';

const adminBootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? '';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:8787',
    trace: 'on-first-retry'
  },
  webServer: {
    command:
      "sh -lc 'rm -rf .wrangler/state/e2e && printf \"ADMIN_BOOTSTRAP_PASSWORD=%s\\n\" \"$ADMIN_BOOTSTRAP_PASSWORD\" > .dev.vars.e2e && npx wrangler d1 migrations apply mypurchase-db --local --persist-to .wrangler/state/e2e && npx wrangler dev --ip 127.0.0.1 --port 8787 --persist-to .wrangler/state/e2e --env-file .dev.vars.e2e'",
    env: {
      ...process.env,
      ADMIN_BOOTSTRAP_PASSWORD: adminBootstrapPassword
    },
    url: 'http://127.0.0.1:8787/api/health',
    reuseExistingServer: false,
    timeout: 120_000
  }
});
