const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS parties (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      phone TEXT,
      address TEXT,
      gstin TEXT,
      party_type TEXT NOT NULL DEFAULT 'Customer',
      credit_limit REAL DEFAULT 0,
      opening_balance REAL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      hsn TEXT,
      unit TEXT NOT NULL DEFAULT 'Pcs',
      default_price REAL NOT NULL DEFAULT 0,
      gst_rate REAL NOT NULL DEFAULT 18,
      category TEXT,
      low_stock_threshold REAL DEFAULT 0,
      linked_tile_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customer_prices (
      id TEXT PRIMARY KEY,
      party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      price REAL NOT NULL,
      UNIQUE (party_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_no INTEGER UNIQUE NOT NULL,
      date DATE NOT NULL,
      party_id TEXT NOT NULL REFERENCES parties(id),
      payment_mode TEXT NOT NULL DEFAULT 'Cash',
      subtotal REAL NOT NULL DEFAULT 0,
      gst_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Active',
      notes TEXT,
      source TEXT NOT NULL DEFAULT 'Manual',
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      item_id TEXT REFERENCES items(id),
      item_name_snapshot TEXT NOT NULL,
      hsn TEXT,
      qty REAL NOT NULL,
      unit TEXT,
      price REAL NOT NULL,
      gst_rate REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      party_id TEXT NOT NULL REFERENCES parties(id),
      invoice_id TEXT REFERENCES invoices(id),
      amount REAL NOT NULL,
      mode TEXT NOT NULL DEFAULT 'Cash',
      date DATE NOT NULL,
      notes TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      date DATE NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date);
    CREATE INDEX IF NOT EXISTS idx_invoices_party ON invoices(party_id);
    CREATE INDEX IF NOT EXISTS idx_payments_party ON payments(party_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

    -- Tier 1 migrations (Busy parity essentials)
    ALTER TABLE parties ADD COLUMN IF NOT EXISTS state TEXT;
    ALTER TABLE parties ADD COLUMN IF NOT EXISTS print_name TEXT;
    ALTER TABLE items   ADD COLUMN IF NOT EXISTS purchase_price REAL DEFAULT 0;
    ALTER TABLE items   ADD COLUMN IF NOT EXISTS opening_stock  REAL DEFAULT 0;
    ALTER TABLE items   ADD COLUMN IF NOT EXISTS print_name     TEXT;

    -- Sale Returns (credit notes): same shape as invoices, just a different voucher_type.
    -- Busy reuses the same VchNo across types, so the old UNIQUE(invoice_no) constraint must go.
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voucher_type TEXT NOT NULL DEFAULT 'Sale';
    DO $migrate$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_invoice_no_key') THEN
        ALTER TABLE invoices DROP CONSTRAINT invoices_invoice_no_key;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_source_type_no_unique') THEN
        ALTER TABLE invoices ADD CONSTRAINT invoices_source_type_no_unique UNIQUE (source, voucher_type, invoice_no);
      END IF;
    END
    $migrate$;
  `);

  const { rows } = await pool.query('SELECT COUNT(*) AS count FROM users');
  if (parseInt(rows[0].count) === 0) {
    const hash = bcrypt.hashSync('1234', 10);
    await pool.query(
      'INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)',
      [randomUUID(), 'admin', hash]
    );
    console.log('Default user created — username: admin  password: 1234');
  }
}

// Helper: get next invoice number (max + 1, starting at 1)
async function getNextInvoiceNo(client) {
  const q = client || pool;
  const { rows } = await q.query('SELECT COALESCE(MAX(invoice_no), 0) + 1 AS next FROM invoices');
  return parseInt(rows[0].next);
}

module.exports = { pool, initDb, getNextInvoiceNo };
