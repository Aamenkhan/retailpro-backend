"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderRoutes = void 0;
const hono_1 = require("hono");
const prisma_1 = require("../../generated/prisma");
const prisma_2 = require("../lib/prisma");
exports.orderRoutes = new hono_1.Hono();
exports.orderRoutes.post("/checkout", async (c) => {
    const body = await c.req.json();
    const items = (body.items ?? []);
    const gstPercent = Number(body.gstPercent ?? 9);
    const paymentMethod = (body.paymentMethod ?? "CASH");
    if (!Array.isArray(items) || items.length === 0) {
        return c.json({ message: "Checkout items are required" }, 400);
    }
    const productIds = items.map((item) => item.productId);
    const products = await prisma_2.prisma.product.findMany({
        where: { id: { in: productIds } },
    });
    const productMap = new Map(products.map((product) => [product.id, product]));
    for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product) {
            return c.json({ message: `Product not found: ${item.productId}` }, 404);
        }
        if (product.stockQty < item.quantity) {
            return c.json({ message: `Insufficient stock for ${product.name}` }, 400);
        }
    }
    const subtotal = items.reduce((sum, item) => {
        const product = productMap.get(item.productId);
        return sum + Number(product.retailPrice) * item.quantity;
    }, 0);
    const gstAmount = (subtotal * gstPercent) / 100;
    const total = subtotal + gstAmount;
    const order = await prisma_2.prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
            data: {
                customerId: body.customerId,
                subtotal: new prisma_1.Prisma.Decimal(subtotal),
                gstPercent: new prisma_1.Prisma.Decimal(gstPercent),
                gstAmount: new prisma_1.Prisma.Decimal(gstAmount),
                total: new prisma_1.Prisma.Decimal(total),
                paidAmount: new prisma_1.Prisma.Decimal(total),
                paymentMethod,
                status: "PAID",
                note: body.note,
            },
        });
        for (const item of items) {
            const product = productMap.get(item.productId);
            const lineTotal = Number(product.retailPrice) * item.quantity;
            await tx.orderItem.create({
                data: {
                    orderId: created.id,
                    productId: item.productId,
                    quantity: item.quantity,
                    unitPrice: product.retailPrice,
                    lineTotal: new prisma_1.Prisma.Decimal(lineTotal),
                },
            });
            await tx.product.update({
                where: { id: item.productId },
                data: { stockQty: { decrement: item.quantity } },
            });
            await tx.inventoryLog.create({
                data: {
                    productId: item.productId,
                    changeQty: -item.quantity,
                    reason: `Sold in order ${created.id}`,
                },
            });
        }
        await tx.payment.create({
            data: {
                orderId: created.id,
                amount: new prisma_1.Prisma.Decimal(total),
                method: paymentMethod,
            },
        });
        return created;
    });
    return c.json(order, 201);
});
