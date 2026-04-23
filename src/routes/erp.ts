import { Hono } from "hono";
import { prisma } from "../lib/prisma";

export const erpRoutes = new Hono();

erpRoutes.get("/suppliers", async (c) => {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { createdAt: "desc" },
  });
  return c.json(suppliers);
});

erpRoutes.post("/suppliers", async (c) => {
  const body = await c.req.json();
  const supplier = await prisma.supplier.create({ data: body });
  return c.json(supplier, 201);
});

erpRoutes.get("/customers", async (c) => {
  const customers = await prisma.customer.findMany({
    include: { creditState: true },
    orderBy: { createdAt: "desc" },
  });
  return c.json(customers);
});

erpRoutes.post("/customers", async (c) => {
  const body = await c.req.json();
  const customer = await prisma.customer.create({ data: body });
  return c.json(customer, 201);
});

erpRoutes.get("/employees", async (c) => {
  const employees = await prisma.employee.findMany({
    include: { user: { select: { id: true, email: true, role: true } } },
    orderBy: { createdAt: "desc" },
  });
  return c.json(employees);
});

erpRoutes.post("/employees", async (c) => {
  const body = await c.req.json();
  const employee = await prisma.employee.create({ data: body });
  return c.json(employee, 201);
});

erpRoutes.post("/credits/:customerId", async (c) => {
  const customerId = c.req.param("customerId");
  const body = await c.req.json();
  const amount = Number(body.amount ?? 0);
  const note = String(body.note ?? "");

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
        amount,
        note,
      },
    });

    return { account: updatedAccount, txn };
  });

  return c.json(result, 201);
});

erpRoutes.get("/cashflow", async (c) => {
  const rows = await prisma.cashflow.findMany({
    include: { employee: true },
    orderBy: { createdAt: "desc" },
  });
  return c.json(rows);
});

erpRoutes.post("/cashflow", async (c) => {
  const body = await c.req.json();
  const row = await prisma.cashflow.create({ data: body });
  return c.json(row, 201);
});
