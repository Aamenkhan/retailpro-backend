import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { erpRoutes } from "./routes/erp";
import { orderRoutes } from "./routes/orders";
import { productRoutes } from "./routes/products";

const app = new Hono();

app.use("*", cors({
  origin: ["http://localhost:3000", "https://retailpro-ui.vercel.app", "https://www.retailproai.in"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.get("/", (c) => c.json({ service: "pos-backend", status: "ok" }));
app.get("/health", (c) => c.json({ ok: true }));
app.route("/auth", authRoutes);
app.use("/products/*", authMiddleware);
app.use("/orders/*", authMiddleware);
app.use("/erp/*", authMiddleware);
app.route("/products", productRoutes);
app.route("/orders", orderRoutes);
app.route("/erp", erpRoutes);

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, () => {
  console.log(`POS backend listening on http://localhost:${port}`);
});