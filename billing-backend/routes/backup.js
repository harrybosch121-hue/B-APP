const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { pool } = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// Order matters for restore (parents before children).
const TABLES = ['users', 'parties', 'items', 'customer_prices', 'invoices', 'invoice_items', 'payments', 'expenses'];

// GET /api/backup  — full JSON dump of all business data
router.get('/', requireAuth, async (_req, res) => {
  try {
    const dump = { version: 1, generatedAt: new Date().toISOString(), tables: {} };
    for (const t of TABLES) {
      const { rows } = await pool.query(`SELECT * FROM ${t} ORDER BY 1`);
      dump.tables[t] = rows;
    }
    const filename = `billing-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(dump, null, 2));
  } catch (err) {
    console.error('Backup failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/restore  — wipe + restore from a backup JSON file
// WARNING: destructive. Caller must confirm.
router.post('/restore', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  let dump;
  try {
    dump = JSON.parse(req.file.buffer.toString('utf-8'));
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON: ' + e.message });
  }
  if (!dump || !dump.tables) return res.status(400).json({ error: 'Not a valid billing-backup file' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Wipe business tables (keep users alone — restore can repopulate them).
    await client.query(`TRUNCATE payments, invoice_items, invoices, customer_prices, items, parties, expenses RESTART IDENTITY CASCADE`);

    const stats = {};
    for (const t of TABLES) {
      const rows = dump.tables[t];
      if (!Array.isArray(rows) || rows.length === 0) { stats[t] = 0; continue; }
      // For users, skip if already exists (don't overwrite the live admin password).
      if (t === 'users') {
        let inserted = 0;
        for (const r of rows) {
          const { rows: ex } = await client.query('SELECT id FROM users WHERE username = $1', [r.username]);
          if (ex[0]) continue;
          await client.query(
            `INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)`,
            [r.id || randomUUID(), r.username, r.password_hash]
          );
          inserted++;
        }
        stats[t] = inserted;
        continue;
      }
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${placeholders})`;
      for (const r of rows) {
        const vals = cols.map((c) => r[c]);
        await client.query(sql, vals);
      }
      stats[t] = rows.length;
    }
    await client.query('COMMIT');
    res.json({ ok: true, restored: stats });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Restore failed:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
