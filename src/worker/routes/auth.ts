import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { countAdmins, createUser, findUserByUsername, updateUserPassword, type UserWithPassword } from "../repositories/users";
import { hashPassword, verifyPassword } from "../security/passwords";
import { clearSessionCookie, createSession, deleteSession, getCurrentUser, requireCsrf, requireUser, rotateCsrfToken } from "../security/sessions";

export const authRoutes = new Hono<{ Bindings: AppEnv }>();

type AppContext = Context<{ Bindings: AppEnv }>;

function publicUser(user: UserWithPassword) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

async function readCredentials(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return null;
  const { username, password } = body as { username?: unknown; password?: unknown };
  if (typeof username !== "string" || typeof password !== "string") return null;
  return { username, password };
}

function invalidCredentials(c: AppContext) {
  return c.json({ error: "Invalid credentials" }, 401);
}

function reservedAdminUsername(c: AppContext) {
  return c.json({ error: { code: "admin_username_reserved", message: "Admin username is reserved for bootstrap" } }, 409);
}

authRoutes.post("/login", async (c) => {
  const credentials = await readCredentials(c.req.raw);
  if (!credentials) return invalidCredentials(c);

  let user = await findUserByUsername(c.env.DB, credentials.username);
  const adminCount = credentials.username === "admin" ? await countAdmins(c.env.DB) : null;

  if (credentials.username === "admin" && adminCount === 0) {
    if (user && user.role !== "admin") return reservedAdminUsername(c);

    if (!user) {
      if (credentials.password !== c.env.ADMIN_BOOTSTRAP_PASSWORD) return invalidCredentials(c);

      try {
        user = await createUser(c.env.DB, {
          username: "admin",
          passwordHash: await hashPassword(credentials.password),
          role: "admin"
        });
      } catch (error) {
        console.error('bootstrap create failed', error);
        user = await findUserByUsername(c.env.DB, "admin");
        if (!user) throw new Error("Failed to create bootstrap admin");
      }

      if (!user) throw new Error("Failed to create bootstrap admin");
      if (user.role !== "admin") return reservedAdminUsername(c);
    }
  }

  if (credentials.username === "admin" && adminCount === 0 && user?.role !== "admin") {
    return reservedAdminUsername(c);
  }

  if (!user || !(await verifyPassword(credentials.password, user.passwordHash))) {
    return invalidCredentials(c);
  }

  const session = await createSession(c.env.DB, user.id);
  c.header("set-cookie", session.cookie);
  return c.json({ user: publicUser(user), csrfToken: session.csrfToken });
});

authRoutes.get("/me", async (c) => {
  const session = await getCurrentUser(c);
  if (!session) return c.json({ error: "Authentication required" }, 401);
  const csrfToken = await rotateCsrfToken(c.env.DB, session.id);
  return c.json({ user: publicUser(session.user), csrfToken });
});

authRoutes.post("/logout", async (c) => {
  c.header("set-cookie", clearSessionCookie());
  const session = await getCurrentUser(c);
  if (session) {
    await requireCsrf(c, session);
    await deleteSession(c.env.DB, session.id);
  }
  return c.json({ ok: true });
});

authRoutes.post("/password", async (c) => {
  const session = await requireCsrf(c, await requireUser(c));
  const body = await c.req.raw.json().catch(() => null);
  if (!body || typeof body !== "object") return c.json({ error: "Invalid password request" }, 400);
  const { currentPassword, newPassword } = body as { currentPassword?: unknown; newPassword?: unknown };
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 8) {
    return c.json({ error: "Invalid password request" }, 400);
  }
  if (!(await verifyPassword(currentPassword, session.user.passwordHash))) {
    return c.json({ error: "Invalid credentials" }, 401);
  }
  await updateUserPassword(c.env.DB, session.user.id, await hashPassword(newPassword));
  return c.json({ ok: true });
});
