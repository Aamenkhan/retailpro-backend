import { Hono } from "hono";
import { sign } from "hono/jwt";
import { hash, verify } from "@node-rs/bcrypt";
import { prisma } from "../lib/prisma";

export const authRoutes = new Hono();

// ── SHOP REGISTER — naya tenant banao ──────────────────
authRoutes.post("/register", async (c) => {
  const body = await c.req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const shopName = String(body.shopName ?? "My Shop");
  const ownerName = String(body.ownerName ?? "");
  const phone = body.phone ?? null;

  if (!email || !password) {
    return c.json({ message: "Email and password required" }, 400);
  }

  // Shop email already exists?
  const existingShop = await prisma.shop.findUnique({ where: { email } });
  if (existingShop) {
    return c.json({ message: "Email already registered" }, 409);
  }

  const passwordHash = await hash(password, 12);

  // Shop + Admin User + Trial Subscription — ek saath banao
  const shop = await prisma.shop.create({
    data: {
      name: shopName,
      ownerName,
      email,
      phone,
      // Trial subscription auto-create
      subscription: {
        create: {
          plan: "TRIAL",
          status: "TRIAL",
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        },
      },
      // Admin user auto-create
      users: {
        create: {
          email,
          passwordHash,
          role: "ADMIN",
        },
      },
    },
    include: {
      users: { select: { id: true, email: true, role: true } },
      subscription: true,
    },
  });

  const adminUser = shop.users[0];

  return c.json({
    message: "Shop registered successfully",
    shop: { id: shop.id, name: shop.name, email: shop.email },
    user: adminUser,
    trialEndsAt: shop.subscription?.trialEndsAt,
  }, 201);
});

// ── LOGIN ───────────────────────────────────────────────
authRoutes.post("/login", async (c) => {
  const body = await c.req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  // shopId + email se user dhundo
  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
    include: {
      shop: {
        include: { subscription: true },
      },
    },
  });

  if (!user) {
    return c.json({ message: "Invalid credentials" }, 401);
  }

  const validPassword = await verify(password, user.passwordHash);
  if (!validPassword) {
    return c.json({ message: "Invalid credentials" }, 401);
  }

  // Subscription check
  const sub = user.shop.subscription;
  if (sub?.status === "EXPIRED" || sub?.status === "CANCELLED") {
    return c.json({ message: "Subscription expired. Please renew." }, 403);
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return c.json({ message: "Server misconfigured" }, 500);
  }

  // Token mein shopId bhi daalo — multi-tenant ke liye zaroori
  const token = await sign(
    {
      sub: user.id,
      shopId: user.shopId,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
    },
    secret,
  );

  return c.json({
    accessToken: token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      shopId: user.shopId,
    },
    shop: {
      id: user.shop.id,
      name: user.shop.name,
      gstin: user.shop.gstin,
    },
    subscription: {
      plan: sub?.plan,
      status: sub?.status,
      trialEndsAt: sub?.trialEndsAt,
      currentPeriodEnd: sub?.currentPeriodEnd,
    },
  });
});