import { Hono } from "hono";
import { PaymentMethod, Prisma } from "../../generated/prisma";
import { prisma } from "../lib/prisma";

type CheckoutItem = {
  productId: string;
  quantity: number;
};

export const orderRoutes = new Hono();

orderRoutes.post("/checkout", async (c) => {
  const body = await c.req.json();
  const items = (body.items ?? []) as CheckoutItem[];
  const gstPercent = Number(body.gstPercent ?? 9);
  const paymentMethod = (body.paymentMethod ?? "CASH") as PaymentMethod;

  if (!Array.isArray(items) || items.length === 0) {
    return c.json({ message: "Checkout items are required" }, 400);
  }

  const productIds = items.map((item) => item.productId);
  const products = await prisma.product.findMany({
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
    const product = productMap.get(item.productId)!;
    return sum + Number(product.sellPrice) * item.quantity;
  }, 0);
  const gstAmount = (subtotal * gstPercent) / 100;
  const total = subtotal + gstAmount;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        customerId: body.customerId,
        subtotal: new Prisma.Decimal(subtotal),
        gstPercent: new Prisma.Decimal(gstPercent),
        gstAmount: new Prisma.Decimal(gstAmount),
        total: new Prisma.Decimal(total),
        paidAmount: new Prisma.Decimal(total),
        paymentMethod,
        status: "PAID",
        note: body.note,
      },
    });

    for (const item of items) {
      const product = productMap.get(item.productId)!;
      const lineTotal = Number(product.sellPrice) * item.quantity;

      await tx.orderItem.create({
        data: {
          orderId: created.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: product.sellPrice,
          lineTotal: new Prisma.Decimal(lineTotal),
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
        amount: new Prisma.Decimal(total),
        method: paymentMethod,
      },
    });

    return created;
  });

  return c.json(order, 201);
});
