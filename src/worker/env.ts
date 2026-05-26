export type AppEnv = {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;
  ADMIN_BOOTSTRAP_PASSWORD: string;
  APP_ENV?: string;
};
