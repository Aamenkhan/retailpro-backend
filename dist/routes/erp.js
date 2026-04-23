"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.erpRoutes = void 0;
const hono_1 = require("hono");
const prisma_1 = require("../lib/prisma");
exports.erpRoutes = new hono_1.Hono();
exports.erpRoutes.get("/suppliers", async (c) => {
    const suppliers = await prisma_1.prisma.supplier.findMany({
        orderBy: { createdAt: "desc" },
    });
    return c.json(suppliers);
});
exports.erpRoutes.post("/suppliers", async (c) => {
    const body = await c.req.json();
    const supplier = await prisma_1.prisma.supplier.create({ data: body });
    return c.json(supplier, 201);
});
exports.erpRoutes.get("/customers", async (c) => {
    const customers = await prisma_1.prisma.customer.findMany({
        include: { creditState: true },
        orderBy: { createdAt: "desc" },
    });
    return c.json(customers);
});
exports.erpRoutes.post("/customers", async (c) => {
    const body = await c.req.json();
    const customer = await prisma_1.prisma.customer.create({ data: body });
    return c.json(customer, 201);
});
exports.erpRoutes.get("/employees", async (c) => {
    const employees = await prisma_1.prisma.employee.findMany({
        include: { user: { select: { id: true, email: true, role: true } } },
        orderBy: { createdAt: "desc" },
    });
    return c.json(employees);
});
exports.erpRoutes.post("/employees", async (c) => {
    const body = await c.req.json();
    const employee = await prisma_1.prisma.employee.create({ data: body });
    return c.json(employee, 201);
});
exports.erpRoutes.post("/credits/:customerId", async (c) => {
    const customerId = c.req.param("customerId");
    const body = await c.req.json();
    const amount = Number(body.amount ?? 0);
    const note = String(body.note ?? "");
    const result = await prisma_1.prisma.$transaction(async (tx) => {
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
exports.erpRoutes.get("/cashflow", async (c) => {
    const rows = await prisma_1.prisma.cashflow.findMany({
        include: { employee: true },
        orderBy: { createdAt: "desc" },
    });
    return c.json(rows);
});
exports.erpRoutes.post("/cashflow", async (c) => {
    const body = await c.req.json();
    const row = await prisma_1.prisma.cashflow.create({ data: body });
    return c.json(row, 201);
});
