import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";

export const productRoutes = new Hono();

// Sabhi routes pe auth lagao
productRoutes.use("*", authMiddleware);

// Helper — shopId har request se nikalo
const getShopId = (c: any): string => c.get("shopId") as string;

// GET /products — is shop ke saare products
productRoutes.get("/", async (c) => {
  const shopId = getShopId(c);
  const products = await prisma.product.findMany({
    where: { shopId },
    include: { category: true, taxCategory: true },
    orderBy: { createdAt: "desc" },
  });
  return c.json(products);
});

// POST /products — naya product banao
productRoutes.post("/", async (c) => {
  const shopId = getShopId(c);
  const body = await c.req.json();
  const product = await prisma.product.create({
    data: {
      shopId,
      sku: body.sku,
      name: body.name,
      nameHindi: body.nameHindi,
      description: body.description,
      categoryId: body.categoryId ?? null,
      subCategoryId: body.subCategoryId ?? null,
      taxCategoryId: body.taxCategoryId ?? null,
      hsnCode: body.hsnCode,
      costPrice: body.costPrice ?? 0,
      mrp: body.mrp ?? 0,
      retailPrice: body.retailPrice,
      wholesalePrice: body.wholesalePrice ?? 0,
      taxTypeOnSale: body.taxTypeOnSale ?? "EXCLUSIVE",
      taxTypeOnPurch: body.taxTypeOnPurch ?? "EXCLUSIVE",
      purchaseUnit: body.purchaseUnit ?? "PCS",
      salesUnit: body.salesUnit ?? "PCS",
      stockQty: body.stockQty ?? 0,
      minStock: body.minStock ?? 0,
      openingStock: body.openingStock ?? 0,
      barcodeValue: body.barcodeValue,
      godown: body.godown,
      rackLocation: body.rackLocation,
      salesDiscount: body.salesDiscount ?? 0,
      isActive: body.isActive ?? true,
    },
  });
  return c.json(product, 201);
});

// PUT /products/:id — update karo
productRoutes.put("/:id", async (c) => {
  const shopId = getShopId(c);
  const id = c.req.param("id");
  const body = await c.req.json();

  // shopId se verify karo — dusri shop ka product edit na ho
  const product = await prisma.product.update({
    where: { id, shopId },
    data: body,
  });
  return c.json(product);
});

// DELETE /products/:id
productRoutes.delete("/:id", async (c) => {
  const shopId = getShopId(c);
  const id = c.req.param("id");
  await prisma.product.delete({ where: { id, shopId } });
  return c.body(null, 204);
});

// POST /products/bulk — bulk import
productRoutes.post("/bulk", async (c) => {
  const shopId = getShopId(c);
  const body = await c.req.json();
  const items = Array.isArray(body.items) ? body.items : [];

  const result = await prisma.product.createMany({
    data: items.map((item: any) => ({ ...item, shopId })),
    skipDuplicates: true,
  });
  return c.json(result, 201);
});

// GET /products/stock/scan/:sku — barcode scan
productRoutes.get("/stock/scan/:sku", async (c) => {
  const shopId = getShopId(c);
  const sku = c.req.param("sku");

  const product = await prisma.product.findUnique({
    where: { shopId_sku: { shopId, sku } },
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
    wholesalePrice: product.wholesalePrice,
    mrp: product.mrp,
    hsnCode: product.hsnCode,
    barcodeValue: product.barcodeValue,
  });
});

// GET /products/low-stock — min stock se kam
productRoutes.get("/low-stock", async (c) => {
  const shopId = getShopId(c);
  const products = await prisma.product.findMany({
    where: {
      shopId,
      isActive: true,
      stockQty: { lte: prisma.product.fields.minStock },
    },
    orderBy: { stockQty: "asc" },
  });
  return c.json(products);
});