"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productRoutes = void 0;
const hono_1 = require("hono");
const prisma_1 = require("../lib/prisma");
exports.productRoutes = new hono_1.Hono();
exports.productRoutes.get("/", async (c) => {
    const products = await prisma_1.prisma.product.findMany({
        include: { category: true },
        orderBy: { createdAt: "desc" },
    });
    return c.json(products);
});
exports.productRoutes.post("/", async (c) => {
    const body = await c.req.json();
    const product = await prisma_1.prisma.product.create({
        data: {
            sku: body.sku,
            name: body.name,
            description: body.description,
            categoryId: body.categoryId,
            costPrice: body.costPrice,
            retailPrice: body.retailPrice,
            stockQty: body.stockQty ?? 0,
        },
    });
    return c.json(product, 201);
});
exports.productRoutes.put("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const product = await prisma_1.prisma.product.update({
        where: { id },
        data: body,
    });
    return c.json(product);
});
exports.productRoutes.delete("/:id", async (c) => {
    const id = c.req.param("id");
    await prisma_1.prisma.product.delete({ where: { id } });
    return c.body(null, 204);
});
exports.productRoutes.post("/bulk", async (c) => {
    const body = await c.req.json();
    const items = Array.isArray(body.items) ? body.items : [];
    const result = await prisma_1.prisma.product.createMany({
        data: items,
        skipDuplicates: true,
    });
    return c.json(result, 201);
});
exports.productRoutes.get("/stock/scan/:sku", async (c) => {
    const sku = c.req.param("sku");
    const product = await prisma_1.prisma.product.findUnique({
        where: { sku },
    });
    if (!product) {
        return c.json({ message: "Product not found" }, 404);
    }
    return c.json({
        id: product.id,
        sku: product.sku,
        name: product.name,
        stockQty: product.stockQty,
        retailPrice: product.retailPrice,
    });
});
