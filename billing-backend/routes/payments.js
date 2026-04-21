const express = require('express');
const { randomUUID } = require('crypto');
const { pool } = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// POST create payment (optional invoice allocation)
router.post('/', requireAuth, async (req, res) => {
  const { party_id, invoice_id, amount, mode, date, notes } = req.body;
  if (!party_id || !amount) return res.status(400).json({ error: 'party_id and amount required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = randomUUID();
    await client.query(
      `INSERT INTO payments (id, party_id, invoice_id, amount, mode, date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, party_id, invoice_id || null, amount, mode || 'Cash', date || new Date().toISOString().slice(0, 10), notes || null]
    );
    if (invoice_id) {
      await client.query(
        `UPDATE invoices SET paid_amount = paid_amount + $1, updated_at = NOW() WHERE id = $2`,
        [amount, invoice_id]
      );
    }
    await client.query('COMMIT');
    const { rows } = await pool.query('SELECT * FROM payments WHERE id = $1', [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// GET payments by party
router.get('/party/:partyId', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pay.*, i.invoice_no
       FROM payments pay LEFT JOIN invoices i ON i.id = pay.invoice_id
       WHERE pay.party_id = $1 ORDER BY pay.date DESC`,
      [req.params.partyId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE payment
router.delete('/:id', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM payments WHERE id = $1', [req.params.id]);
    const p = rows[0];
    if (!p) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (p.invoice_id) {
      await client.query(`UPDATE invoices SET paid_amount = GREATEST(paid_amount - $1, 0) WHERE id = $2`, [p.amount, p.invoice_id]);
    }
    await client.query('DELETE FROM payments WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
