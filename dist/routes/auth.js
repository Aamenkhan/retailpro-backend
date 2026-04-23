"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
const hono_1 = require("hono");
const jwt_1 = require("hono/jwt");
const bcrypt_1 = require("@node-rs/bcrypt");
const prisma_1 = require("../lib/prisma");
exports.authRoutes = new hono_1.Hono();
exports.authRoutes.post("/register", async (c) => {
    const body = await c.req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const role = body.role ?? "CASHIER";
    if (!email || !password) {
        return c.json({ message: "Email and password are required" }, 400);
    }
    const existing = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (existing) {
        return c.json({ message: "Email already exists" }, 409);
    }
    const passwordHash = await (0, bcrypt_1.hash)(password, 12);
    const user = await prisma_1.prisma.user.create({
        data: { email, passwordHash, role },
        select: { id: true, email: true, role: true, createdAt: true },
    });
    return c.json(user, 201);
});
exports.authRoutes.post("/login", async (c) => {
    const body = await c.req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const user = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (!user) {
        return c.json({ message: "Invalid credentials" }, 401);
    }
    const validPassword = await (0, bcrypt_1.verify)(password, user.passwordHash);
    if (!validPassword) {
        return c.json({ message: "Invalid credentials" }, 401);
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        return c.json({ message: "Server misconfigured: missing JWT_SECRET" }, 500);
    }
    const token = await (0, jwt_1.sign)({
        sub: user.id,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    }, secret);
    return c.json({
        accessToken: token,
        user: { id: user.id, email: user.email, role: user.role },
    });
});
