const express = require('express');
const { randomUUID } = require('crypto');
const { pool } = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// GET all parties with computed outstanding
// Outstanding logic: opening_balance + every Active credit invoice (Sale = +, SaleReturn = -, already negated in DB)
//   minus all payments (returns store a negative auto-refund payment, so summing payments still nets correctly)
router.get('/', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        p.*,
        COALESCE(SUM(CASE WHEN i.status = 'Active' THEN i.total ELSE 0 END), 0) AS total_invoiced,
        COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = p.id), 0) AS total_paid,
        COUNT(CASE WHEN i.status = 'Active' AND COALESCE(i.voucher_type, 'Sale') = 'Sale' THEN 1 END) AS invoice_count,
        MAX(CASE WHEN i.status = 'Active' THEN i.date END) AS last_invoice_date,
        p.opening_balance
          + COALESCE(SUM(CASE WHEN i.status = 'Active' AND i.payment_mode = 'Credit' THEN i.total ELSE 0 END), 0)
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
      `SELECT id, invoice_no, voucher_type, date, payment_mode, total, paid_amount, status
       FROM invoices WHERE party_id = $1 ORDER BY date DESC, invoice_no DESC`,
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

// GET printable statement of account for a party
// Returns chronological ledger: opening + every Active invoice (debit) + every payment (credit) with running balance.
router.get('/:id/statement', requireAuth, async (req, res) => {
  try {
    const { from, to } = req.query;
    const { rows: pRows } = await pool.query('SELECT * FROM parties WHERE id = $1', [req.params.id]);
    const party = pRows[0];
    if (!party) return res.status(404).json({ error: 'Party not found' });

    const dateFilter = [];
    const params = [req.params.id];
    if (from) { params.push(from); dateFilter.push(`AND date >= $${params.length}`); }
    if (to)   { params.push(to);   dateFilter.push(`AND date <= $${params.length}`); }

    const { rows: invoices } = await pool.query(
      `SELECT id, invoice_no, voucher_type, date, payment_mode, total, paid_amount, status
       FROM invoices WHERE party_id = $1 AND status = 'Active' ${dateFilter.join(' ')}
       ORDER BY date, invoice_no`,
      params
    );
    const { rows: payments } = await pool.query(
      `SELECT id, date, amount, mode, invoice_id, notes
       FROM payments WHERE party_id = $1 ${dateFilter.join(' ')}
       ORDER BY date, created_at`,
      params
    );

    // Merge into a single chronological ledger with running balance.
    const opening = Number(party.opening_balance) || 0;
    const events = [];
    for (const i of invoices) {
      const isReturn = i.voucher_type === 'SaleReturn';
      const amt = Number(i.total);
      events.push({
        date: i.date,
        type: isReturn ? 'Sale Return' : (i.payment_mode === 'Credit' ? 'Credit Invoice' : 'Cash Invoice'),
        ref: `#${i.invoice_no}`,
        invoice_id: i.id,
        // Only credit invoices add to receivable. Cash invoice is settled on day-1 by auto-payment row.
        debit: i.payment_mode === 'Credit' && !isReturn ? amt : 0,
        credit: isReturn ? -amt : 0, // return total is stored negative; -(-x) = +x credit
      });
    }
    for (const p of payments) {
      events.push({
        date: p.date,
        type: `Payment (${p.mode})`,
        ref: p.invoice_id ? '' : (p.notes || 'On account'),
        invoice_id: p.invoice_id || null,
        debit: 0,
        credit: Number(p.amount),
      });
    }
    events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let running = opening;
    const ledger = events.map(e => {
      running = running + e.debit - e.credit;
      return { ...e, balance: running };
    });

    res.json({
      party,
      from: from || null,
      to: to || null,
      opening,
      ledger,
      closing: running,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create party
router.post('/', requireAuth, async (req, res) => {
  const { name, print_name, phone, address, state, gstin, party_type, credit_limit, opening_balance } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  try {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO parties (id, name, print_name, phone, address, state, gstin, party_type, credit_limit, opening_balance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, name, print_name || null, phone || null, address || null, state || null, gstin || null, party_type || 'Customer', credit_limit || 0, opening_balance || 0]
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
  const { name, print_name, phone, address, state, gstin, party_type, credit_limit, opening_balance } = req.body;
  try {
    const result = await pool.query(
      `UPDATE parties SET name=$1, print_name=$2, phone=$3, address=$4, state=$5, gstin=$6, party_type=$7, credit_limit=$8, opening_balance=$9
       WHERE id=$10 RETURNING *`,
      [name, print_name || null, phone, address, state || null, gstin, party_type, credit_limit || 0, opening_balance || 0, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Party not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
