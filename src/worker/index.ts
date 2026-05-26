import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { StatusCode } from "hono/utils/http-status";
import type { AppEnv } from "./env";
import { authRoutes } from "./routes/auth";

export const app = new Hono<{ Bindings: AppEnv }>();

function errorCode(status: number) {
  if (status === 400) return "bad_request";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  return "internal_error";
}

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    const status = error.status as StatusCode;
    c.status(status);
    return c.json({ error: { code: errorCode(status), message: error.message } });
  }

  c.status(500);
  return c.json({ error: { code: "internal_error", message: "Internal server error" } });
});

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", authRoutes);

app.get("*", async (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
