import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";

export const erpRoutes = new Hono();
erpRoutes.use("*", authMiddleware);

const getShopId = (c: any): string => c.get("shopId") as string;

// ── SUPPLIERS ───────────────────────────────────────────
erpRoutes.get("/suppliers", async (c) => {
  const shopId = getShopId(c);
  const suppliers = await prisma.supplier.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
  });
  return c.json(suppliers);
});

erpRoutes.post("/suppliers", async (c) => {
  const shopId = getShopId(c);
  const body = await c.req.json();
  const supplier = await prisma.supplier.create({
    data: { ...body, shopId },
  });
  return c.json(supplier, 201);
});

erpRoutes.put("/suppliers/:id", async (c) => {
  const shopId = getShopId(c);
  const id = c.req.param("id");
  const body = await c.req.json();
  const supplier = await prisma.supplier.update({
    where: { id, shopId },
    data: body,
  });
  return c.json(supplier);
});

// ── CUSTOMERS ───────────────────────────────────────────
erpRoutes.get("/customers", async (c) => {
  const shopId = getShopId(c);
  const customers = await prisma.customer.findMany({
    where: { shopId },
    include: {
      creditAccount: true,
      ledgerEntries: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return c.json(customers);
});

erpRoutes.post("/customers", async (c) => {
  const shopId = getShopId(c);
  const body = await c.req.json();
  const customer = await prisma.customer.create({
    data: { ...body, shopId },
  });
  return c.json(customer, 201);
});

erpRoutes.put("/customers/:id", async (c) => {
  const shopId = getShopId(c);
  const id = c.req.param("id");
  const body = await c.req.json();
  const customer = await prisma.customer.update({
    where: { id, shopId },
    data: body,
  });
  return c.json(customer);
});

// Customer ledger — outstanding
erpRoutes.get("/customers/:id/ledger", async (c) => {
  const shopId = getShopId(c);
  const customerId = c.req.param("id");
  const entries = await prisma.ledgerEntry.findMany({
    where: { shopId, customerId },
    orderBy: { createdAt: "desc" },
  });
  return c.json(entries);
});

// ── EMPLOYEES ───────────────────────────────────────────
erpRoutes.get("/employees", async (c) => {
  const shopId = getShopId(c);
  const employees = await prisma.employee.findMany({
    where: { shopId },
    include: {
      user: { select: { id: true, email: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return c.json(employees);
});

erpRoutes.post("/employees", async (c) => {
  const shopId = getShopId(c);
  const body = await c.req.json();
  const employee = await prisma.employee.create({
    data: { ...body, shopId },
  });
  return c.json(employee, 201);
});

// ── CREDITS ─────────────────────────────────────────────
erpRoutes.post("/credits/:customerId", async (c) => {
  const shopId = getShopId(c);
  const customerId = c.req.param("customerId");
  const body = await c.req.json();
  const amount = Number(body.amount ?? 0);
  const note = String(body.note ?? "");

  // Customer is shop ka hai?
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });
  if (!customer || customer.shopId !== shopId) {
    return c.json({ message: "Customer not found" }, 404);
  }

  const result = await prisma.$transaction(async (tx) => {
    const account = await tx.creditAccount.upsert({
      where: { customerId },
      create: { customerId, balance: 0, limit: Number(body.limit ?? 0) },
      update: {},
    });

    const updatedAccount = await tx.creditAccount.update({
      where: { id: account.id },
      data: { balance: { increment: amount } },
    });

    const txn = await tx.creditTxn.create({
      data: {
        customerId,
        creditAccountId: account.id,
        amount: new Prisma.Decimal(amount),
        type: amount >= 0 ? "DEBIT" : "CREDIT",
        note,
      },
    });

    // Ledger entry bhi banao
    await tx.ledgerEntry.create({
      data: {
        shopId,
        customerId,
        type: amount >= 0 ? "DEBIT" : "CREDIT",
        amount: new Prisma.Decimal(Math.abs(amount)),
        balance: updatedAccount.balance,
        refType: "PAYMENT",
        note,
      },
    });

    return { account: updatedAccount, txn };
  });

  return c.json(result, 201);
});

// ── CASHFLOW ────────────────────────────────────────────
erpRoutes.get("/cashflow", async (c) => {
  const shopId = getShopId(c);
  const rows = await prisma.cashflow.findMany({
    where: { shopId },
    include: { employee: true },
    orderBy: { createdAt: "desc" },
  });
  return c.json(rows);
});

erpRoutes.post("/cashflow", async (c) => {
  const shopId = getShopId(c);
  const body = await c.req.json();
  const row = await prisma.cashflow.create({
    data: { ...body, shopId },
  });
  return c.json(row, 201);
});

// ── ANALYTICS / DASHBOARD ───────────────────────────────
erpRoutes.get("/analytics/summary", async (c) => {
  const shopId = getShopId(c);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [todaySales, totalProducts, lowStock, pendingCredits] =
    await Promise.all([
      // Aaj ki sales
      prisma.order.aggregate({
        where: { shopId, status: "PAID", createdAt: { gte: today } },
        _sum: { total: true },
        _count: true,
      }),
      // Total products
      prisma.product.count({ where: { shopId, isActive: true } }),
      // Low stock items
      prisma.product.count({
        where: { shopId, isActive: true, stockQty: { lte: 5 } },
      }),
      // Pending credit amount
      prisma.ledgerEntry.aggregate({
        where: { shopId, type: "DEBIT" },
        _sum: { amount: true },
      }),
    ]);

  return c.json({
    todaySales: {
      amount: todaySales._sum.total ?? 0,
      orders: todaySales._count,
    },
    totalProducts,
    lowStock,
    pendingCredits: pendingCredits._sum.amount ?? 0,
  });
});

// ── GSTR-1 REPORT ───────────────────────────────────────
erpRoutes.get("/reports/gstr1", async (c) => {
  const shopId = getShopId(c);
  const from = c.req.query("from")
    ? new Date(c.req.query("from")!)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = c.req.query("to")
    ? new Date(c.req.query("to")!)
    : new Date();

  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        shopId,
        status: "PAID",
        createdAt: { gte: from, lte: to },
      },
    },
    include: {
      order: { select: { orderNo: true, createdAt: true } },
      product: { select: { name: true, hsnCode: true } },
    },
  });

  // HSN-wise group karo
  const hsnMap = new Map<string, {
    hsnCode: string;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    cess: number;
  }>();

  for (const item of items) {
    const hsn = item.hsnCode ?? "0000";
    const taxable = Number(item.lineTotal) - Number(item.taxAmount);
    const existing = hsnMap.get(hsn) ?? {
      hsnCode: hsn,
      taxableValue: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      cess: 0,
    };
    existing.taxableValue += taxable;
    existing.cgst += Number(item.cgstRate) * taxable / 100;
    existing.sgst += Number(item.sgstRate) * taxable / 100;
    existing.igst += Number(item.igstRate) * taxable / 100;
    existing.cess += Number(item.cessRate) * taxable / 100;
    hsnMap.set(hsn, existing);
  }

  return c.json({
    period: { from, to },
    hsnSummary: Array.from(hsnMap.values()),
    totalTaxableValue: Array.from(hsnMap.values()).reduce(
      (s, r) => s + r.taxableValue, 0
    ),
    totalTax: Array.from(hsnMap.values()).reduce(
      (s, r) => s + r.cgst + r.sgst + r.igst + r.cess, 0
    ),
  });
});