import { Hono } from "hono";
import { sign } from "hono/jwt";
import { hash, verify } from "@node-rs/bcrypt";
import { prisma } from "../lib/prisma";

export const authRoutes = new Hono();

authRoutes.post("/register", async (c) => {
  const body = await c.req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = body.role ?? "CASHIER";

  if (!email || !password) {
    return c.json({ message: "Email and password are required" }, 400);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return c.json({ message: "Email already exists" }, 409);
  }

  const passwordHash = await hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, role },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  return c.json(user, 201);
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return c.json({ message: "Invalid credentials" }, 401);
  }

  const validPassword = await verify(password, user.passwordHash);
  if (!validPassword) {
    return c.json({ message: "Invalid credentials" }, 401);
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return c.json({ message: "Server misconfigured: missing JWT_SECRET" }, 500);
  }

  const token = await sign(
    {
      sub: user.id,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    },
    secret,
  );

  return c.json({
    accessToken: token,
    user: { id: user.id, email: user.email, role: user.role },
  });
});
