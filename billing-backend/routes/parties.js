const express = require('express');
const { randomUUID } = require('crypto');
const { pool } = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// GET all parties with computed outstanding
router.get('/', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        p.*,
        COALESCE(SUM(CASE WHEN i.status = 'Active' THEN i.total ELSE 0 END), 0) AS total_invoiced,
        COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = p.id), 0) AS total_paid,
        p.opening_balance + COALESCE(SUM(CASE WHEN i.status = 'Active' AND i.payment_mode = 'Credit' THEN i.total ELSE 0 END), 0)
          - COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = p.id), 0) AS outstanding
      FROM parties p
      LEFT JOIN invoices i ON i.party_id = p.id
      GROUP BY p.id
      ORDER BY p.name
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET single party with ledger
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: pRows } = await pool.query('SELECT * FROM parties WHERE id = $1', [req.params.id]);
    const party = pRows[0];
    if (!party) return res.status(404).json({ error: 'Party not found' });

    const { rows: invoices } = await pool.query(
      'SELECT id, invoice_no, date, payment_mode, total, paid_amount, status FROM invoices WHERE party_id = $1 ORDER BY date DESC, invoice_no DESC',
      [req.params.id]
    );
    const { rows: payments } = await pool.query(
      'SELECT id, date, amount, mode, invoice_id, notes FROM payments WHERE party_id = $1 ORDER BY date DESC, created_at DESC',
      [req.params.id]
    );

    const totalInvoiced = invoices.filter(i => i.status === 'Active' && i.payment_mode === 'Credit')
      .reduce((s, i) => s + Number(i.total), 0);
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const outstanding = Number(party.opening_balance) + totalInvoiced - totalPaid;

    res.json({ ...party, invoices, payments, outstanding });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create party
router.post('/', requireAuth, async (req, res) => {
  const { name, phone, address, gstin, party_type, credit_limit, opening_balance } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  try {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO parties (id, name, phone, address, gstin, party_type, credit_limit, opening_balance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, name, phone || null, address || null, gstin || null, party_type || 'Customer', credit_limit || 0, opening_balance || 0]
    );
    const { rows } = await pool.query('SELECT * FROM parties WHERE id = $1', [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Party with this name already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT update party
router.put('/:id', requireAuth, async (req, res) => {
  const { name, phone, address, gstin, party_type, credit_limit, opening_balance } = req.body;
  try {
    const result = await pool.query(
      `UPDATE parties SET name=$1, phone=$2, address=$3, gstin=$4, party_type=$5, credit_limit=$6, opening_balance=$7
       WHERE id=$8 RETURNING *`,
      [name, phone, address, gstin, party_type, credit_limit || 0, opening_balance || 0, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Party not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
