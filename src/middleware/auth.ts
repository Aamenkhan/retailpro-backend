import type { Context, Next } from "hono";
import { verify } from "hono/jwt";

type JwtPayload = {
  sub: string;       // userId
  shopId: string;    // tenant isolation ke liye
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

    // Context mein set karo — saari routes use karengi
    c.set("jwtPayload", payload);
    c.set("userId", payload.sub);
    c.set("shopId", payload.shopId);
    c.set("role", payload.role);

    await next();
  } catch {
    return c.json({ message: "Invalid or expired token" }, 401);
  }
}