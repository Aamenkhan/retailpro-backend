# POS Backend

Production-ready POS + ERP backend using Hono + Prisma + PostgreSQL.

## Stack

- Hono HTTP server
- Prisma ORM (v7)
- PostgreSQL (Render compatible)
- JWT authentication

## Project Structure

```
pos-backend/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── index.ts
│   ├── lib/prisma.ts
│   ├── middleware/auth.ts
│   └── routes/
│       ├── auth.ts
│       ├── products.ts
│       ├── orders.ts
│       └── erp.ts
├── render.yaml
├── .env.example
└── README.md
```

## Quick Start

1. Install dependencies:
   - `npm install`
2. Copy env template:
   - `copy .env.example .env`
3. Generate Prisma client:
   - `npx prisma generate`
4. Push schema:
   - `npx prisma db push`
5. Run development server:
   - `npm run dev`

## API Groups

- `/auth` register + login
- `/products` CRUD + bulk + stock scan
- `/orders` POS checkout with stock deduction + GST
- `/erp` suppliers, customers, employees, credits, cashflow
