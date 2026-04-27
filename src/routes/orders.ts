import { Hono } from "hono";
import { PaymentMethod, Prisma, type Product } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";

type CheckoutItem = {
  productId: string;
  quantity: number;
  discountPercent?: number;
};

export const orderRoutes = new Hono();
orderRoutes.use("*", authMiddleware);

const getShopId = (c: any): string => c.get("shopId") as string;

// ── CHECKOUT (Sale POS) ─────────────────────────────────
orderRoutes.post("/checkout", async (c) => {
  const shopId = getShopId(c);
  const body = await c.req.json();
  const items = (body.items ?? []) as CheckoutItem[];
  const paymentMethod = (body.paymentMethod ?? "CASH") as PaymentMethod;
  const discountPercent = Number(body.discountPercent ?? 0);
  const isWholesale = Boolean(body.isWholesale ?? false);
  const customerId = body.customerId ?? null;
  const note = body.note ?? null;

  if (!items.length) {
    return c.json({ message: "Checkout items required" }, 400);
  }

  // Sirf is shop ke products fetch karo
  const products = await prisma.product.findMany({
    where: {
      id: { in: items.map((i) => i.productId) },
      shopId,
    },
    include: { taxCategory: true },
  });

  const productMap = new Map<string, (typeof products)[0]>(
    products.map((p) => [p.id, p])
  );

  // Stock check
  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) {
      return c.json({ message: `Product not found: ${item.productId}` }, 404);
    }
    if (product.stockQty < item.quantity) {
      return c.json(
        { message: `Insufficient stock for ${product.name}` },
        400
      );
    }
  }

  // Totals calculate karo — GST item-wise
  let subtotal = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalCess = 0;

  const orderItemsData = items.map((item) => {
    const product = productMap.get(item.productId)!;
    const price = isWholesale
      ? Number(product.wholesalePrice) || Number(product.retailPrice)
      : Number(product.retailPrice);

    const itemDiscount = item.discountPercent ?? 0;
    const discountAmt = (price * itemDiscount) / 100;
    const taxablePrice = price - discountAmt;
    const lineBase = taxablePrice * item.quantity;

    const cgstRate = Number(product.taxCategory?.cgstRate ?? 0);
    const sgstRate = Number(product.taxCategory?.sgstRate ?? 0);
    const igstRate = Number(product.taxCategory?.igstRate ?? 0);
    const cessRate = Number(product.taxCategory?.cessRate ?? 0);

    const cgstAmt = (lineBase * cgstRate) / 100;
    const sgstAmt = (lineBase * sgstRate) / 100;
    const igstAmt = (lineBase * igstRate) / 100;
    const cessAmt = (lineBase * cessRate) / 100;
    const taxAmt = cgstAmt + sgstAmt + igstAmt + cessAmt;
    const lineTotal = lineBase + taxAmt;

    subtotal += lineBase;
    totalCgst += cgstAmt;
    totalSgst += sgstAmt;
    totalIgst += igstAmt;
    totalCess += cessAmt;

    return {
      productId: item.productId,
      hsnCode: product.hsnCode ?? null,
      quantity: item.quantity,
      unitPrice: new Prisma.Decimal(price),
      mrp: product.mrp,
      discountPercent: new Prisma.Decimal(itemDiscount),
      discountAmount: new Prisma.Decimal(discountAmt * item.quantity),
      cgstRate: new Prisma.Decimal(cgstRate),
      sgstRate: new Prisma.Decimal(sgstRate),
      igstRate: new Prisma.Decimal(igstRate),
      cessRate: new Prisma.Decimal(cessRate),
      taxAmount: new Prisma.Decimal(taxAmt),
      lineTotal: new Prisma.Decimal(lineTotal),
    };
  });

  // Order-level discount
  const orderDiscountAmt = (subtotal * discountPercent) / 100;
  const totalTax = totalCgst + totalSgst + totalIgst + totalCess;
  const total = subtotal - orderDiscountAmt + totalTax;
  const roundOff = Math.round(total) - total;
  const finalTotal = total + roundOff;

  // Order number generate karo — INV-20260428-0001
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await prisma.order.count({ where: { shopId } });
  const orderNo = `INV-${today}-${String(count + 1).padStart(4, "0")}`;

  const order = await prisma.$transaction(async (tx) => {
    // Order create
    const created = await tx.order.create({
      data: {
        shopId,
        orderNo,
        customerId,
        isWholesale,
        subtotal: new Prisma.Decimal(subtotal),
        discountPercent: new Prisma.Decimal(discountPercent),
        discountAmount: new Prisma.Decimal(orderDiscountAmt),
        cgstAmount: new Prisma.Decimal(totalCgst),
        sgstAmount: new Prisma.Decimal(totalSgst),
        igstAmount: new Prisma.Decimal(totalIgst),
        cessAmount: new Prisma.Decimal(totalCess),
        totalTax: new Prisma.Decimal(totalTax),
        roundOff: new Prisma.Decimal(roundOff),
        total: new Prisma.Decimal(finalTotal),
        paidAmount: new Prisma.Decimal(finalTotal),
        balanceDue: new Prisma.Decimal(0),
        paymentMethod,
        status: "PAID",
        note,
      },
    });

    // Order items create
    await tx.orderItem.createMany({
      data: orderItemsData.map((item) => ({
        ...item,
        orderId: created.id,
      })),
    });

    // Stock update + inventory log
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQty: { decrement: item.quantity } },
      });

      await tx.inventoryLog.create({
        data: {
          shopId,
          productId: item.productId,
          changeQty: -item.quantity,
          reason: "SALE",
          refId: created.id,
        },
      });
    }

    // Payment record
    await tx.payment.create({
      data: {
        orderId: created.id,
        amount: new Prisma.Decimal(finalTotal),
        method: paymentMethod,
      },
    });

    // Credit sale — customer ledger update
    if (paymentMethod === "CREDIT" && customerId) {
      await tx.ledgerEntry.create({
        data: {
          shopId,
          customerId,
          type: "DEBIT",
          amount: new Prisma.Decimal(finalTotal),
          balance: new Prisma.Decimal(finalTotal),
          refType: "ORDER",
          refId: created.id,
          note: `Sale Invoice ${orderNo}`,
        },
      });
    }

    return created;
  });

  return c.json({ ...order, orderNo }, 201);
});

// ── GET ORDERS ──────────────────────────────────────────
orderRoutes.get("/", async (c) => {
  const shopId = getShopId(c);
  const orders = await prisma.order.findMany({
    where: { shopId },
    include: {
      customer: { select: { name: true, phone: true } },
      items: { include: { product: { select: { name: true, hsnCode: true } } } },
      payments: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return c.json(orders);
});

// ── GET SINGLE ORDER ────────────────────────────────────
orderRoutes.get("/:id", async (c) => {
  const shopId = getShopId(c);
  const id = c.req.param("id");
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      items: { include: { product: true } },
      payments: true,
    },
  });

  if (!order || order.shopId !== shopId) {
    return c.json({ message: "Order not found" }, 404);
  }

  return c.json(order);
});