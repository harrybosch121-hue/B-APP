# BALAJI TILES — Billing & Accounts

A premium billing application that complements the marble-flow inventory app. Replaces Busy Accounting with a modern web UI.

## Architecture

| Service           | Path                | Port  | Stack                       |
| ----------------- | ------------------- | ----- | --------------------------- |
| Backend API       | `billing-backend/`  | 3002  | Express + PostgreSQL + JWT  |
| Frontend          | `billing-frontend/` | 8081  | Vite + React + TS + shadcn  |

The billing app uses its **own separate PostgreSQL database** — independent of the inventory app. The frontend stores its JWT in `localStorage` under `billing_auth_token` so login state does not collide with the inventory app on the same domain.

## Features

- **Dashboard** — Today's sales, month-to-date, outstanding credit, recent invoices
- **Invoices** — Create / edit / cancel / search / filter by mode & status, PDF export
- **Customers** — Ledger with invoices + payments + outstanding + credit limit alerts
- **Items** — Catalog with default GST rate + per-customer price overrides
- **Reports** — Day Book, Sales Register, Item Sales, Top Customers (filter Cash/Credit), P&L, GSTR-1
- **Busy Import** — One-way DAT (XML) import; idempotent (safe to re-import)

## Decisions

1. **Separate DB** from inventory.
2. **Invoice numbering continues from Busy** — backend computes `MAX(invoice_no) + 1` after import.
3. **Single-user** — default `admin` / `1234` (change after first login).

## Local development

### Backend

```powershell
cd billing-backend
copy .env.example .env
# Edit .env: set DATABASE_URL to your local Postgres or Railway URL
npm install
npm run dev
```

### Frontend

```powershell
cd billing-frontend
copy .env.example .env
# Edit .env: VITE_BILLING_API_URL=http://localhost:3002
npm install
npm run dev
```

Visit http://localhost:8081 — login `admin / 1234`.

## Deployment (Railway)

1. **Create a new Postgres service** in your Railway project (separate from inventory's Postgres).
2. **Backend service**:
   - Root Directory: `BILLING/billing-backend`
   - Variables:
     - `DATABASE_URL` = (reference the new billing Postgres)
     - `JWT_SECRET` = (random string)
     - `ALLOWED_ORIGINS` = `https://your-billing-frontend.up.railway.app`
3. **Frontend service**:
   - Root Directory: `BILLING/billing-frontend`
   - Variables:
     - `VITE_BILLING_API_URL` = `https://your-billing-backend.up.railway.app`
4. (Optional) Custom domain: `billing.balajitiles.net`

## Busy DAT import

1. Export your data file from Busy (e.g. `SBMT_20260421_Vh01042026.DAT`).
2. Open the billing app → **Busy Import** tab.
3. Drop the file and click **Import**.
4. Re-running is safe — invoices already imported (matched by Busy `VchNo`) are skipped.
