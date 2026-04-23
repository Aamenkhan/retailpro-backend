"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const jwt_1 = require("hono/jwt");
async function authMiddleware(c, next) {
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
        const payload = (await (0, jwt_1.verify)(token, secret, "HS256"));
        c.set("jwtPayload", payload);
        await next();
    }
    catch {
        return c.json({ message: "Invalid or expired token" }, 401);
    }
}
