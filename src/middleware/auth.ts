import type { Context, Next } from "hono";
import { verify } from "hono/jwt";

type JwtPayload = {
  sub: string;
  role: string;
};

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  if (!token) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return c.json({ message: "Server misconfigured: missing JWT_SECRET" }, 500);
  }

  try {
    const payload = (await verify(token, secret, "HS256")) as JwtPayload;
    c.set("jwtPayload", payload);
    await next();
  } catch {
    return c.json({ message: "Invalid or expired token" }, 401);
  }
}
