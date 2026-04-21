const express = require('express');
const { randomUUID } = require('crypto');
const { pool, getNextInvoiceNo } = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// GET invoices with optional filters
router.get('/', requireAuth, async (req, res) => {
  try {
    const { from, to, partyId, mode, status, q, limit } = req.query;
    const conds = [];
    const params = [];
    if (from) { params.push(from); conds.push(`i.date >= $${params.length}`); }
    if (to) { params.push(to); conds.push(`i.date <= $${params.length}`); }
    if (partyId) { params.push(partyId); conds.push(`i.party_id = $${params.length}`); }
    if (mode) { params.push(mode); conds.push(`i.payment_mode = $${params.length}`); }
    if (status) { params.push(status); conds.push(`i.status = $${params.length}`); }
    if (q) { params.push(`%${q}%`); conds.push(`(p.name ILIKE $${params.length} OR CAST(i.invoice_no AS TEXT) ILIKE $${params.length})`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const lim = limit ? `LIMIT ${parseInt(limit, 10) || 100}` : 'LIMIT 500';

    const { rows } = await pool.query(
      `SELECT i.*, p.name AS party_name
       FROM invoices i LEFT JOIN parties p ON p.id = i.party_id
       ${where}
       ORDER BY i.date DESC, i.invoice_no DESC
       ${lim}`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET invoice detail
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: invRows } = await pool.query(
      `SELECT i.*, p.name AS party_name, p.phone, p.address, p.gstin
       FROM invoices i LEFT JOIN parties p ON p.id = i.party_id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (!invRows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const { rows: items } = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at',
      [req.params.id]
    );
    const { rows: payments } = await pool.query(
      'SELECT * FROM payments WHERE invoice_id = $1 ORDER BY date',
      [req.params.id]
    );
    res.json({ ...invRows[0], items, payments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create invoice
router.post('/', requireAuth, async (req, res) => {
  const { date, party_id, payment_mode, items, notes, paid_amount } = req.body;
  if (!party_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'party_id and items[] required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invoiceNo = await getNextInvoiceNo();
    const id = randomUUID();
    let subtotal = 0;
    let gstAmount = 0;
    for (const it of items) {
      const lineBase = Number(it.qty) * Number(it.price);
      const lineGst = lineBase * (Number(it.gst_rate || 0) / 100);
      subtotal += lineBase;
      gstAmount += lineGst;
    }
    const total = subtotal + gstAmount;
    const paid = payment_mode === 'Cash' ? total : (Number(paid_amount) || 0);

    await client.query(
      `INSERT INTO invoices (id, invoice_no, date, party_id, payment_mode, subtotal, gst_amount, total, paid_amount, status, source, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Active', 'Manual', $10)`,
      [id, invoiceNo, date || new Date().toISOString().slice(0, 10), party_id, payment_mode || 'Cash', subtotal, gstAmount, total, paid, notes || null]
    );

    for (const it of items) {
      const lineBase = Number(it.qty) * Number(it.price);
      const lineGst = lineBase * (Number(it.gst_rate || 0) / 100);
      await client.query(
        `INSERT INTO invoice_items (id, invoice_id, item_id, item_name_snapshot, hsn, qty, unit, price, gst_rate, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [randomUUID(), id, it.item_id || null, it.item_name_snapshot || it.name, it.hsn || null, it.qty, it.unit || 'Pcs', it.price, it.gst_rate || 0, lineBase + lineGst]
      );
    }

    if (paid > 0) {
      await client.query(
        `INSERT INTO payments (id, party_id, invoice_id, amount, mode, date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), party_id, id, paid, payment_mode || 'Cash', date || new Date().toISOString().slice(0, 10), 'Auto from invoice']
      );
    }

    await client.query('COMMIT');
    const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// PUT edit invoice (replaces line items, recomputes totals)
router.put('/:id', requireAuth, async (req, res) => {
  const { date, party_id, payment_mode, items, notes } = req.body;
  if (!party_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'party_id and items[] required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: existing } = await client.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (!existing[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (existing[0].status === 'Cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot edit a cancelled invoice' });
    }

    let subtotal = 0;
    let gstAmount = 0;
    for (const it of items) {
      const lineBase = Number(it.qty) * Number(it.price);
      const lineGst = lineBase * (Number(it.gst_rate || 0) / 100);
      subtotal += lineBase;
      gstAmount += lineGst;
    }
    const total = subtotal + gstAmount;

    await client.query(
      `UPDATE invoices SET date=$1, party_id=$2, payment_mode=$3, subtotal=$4, gst_amount=$5, total=$6, notes=$7, updated_at=NOW()
       WHERE id=$8`,
      [date, party_id, payment_mode, subtotal, gstAmount, total, notes || null, req.params.id]
    );
    await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [req.params.id]);
    for (const it of items) {
      const lineBase = Number(it.qty) * Number(it.price);
      const lineGst = lineBase * (Number(it.gst_rate || 0) / 100);
      await client.query(
        `INSERT INTO invoice_items (id, invoice_id, item_id, item_name_snapshot, hsn, qty, unit, price, gst_rate, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [randomUUID(), req.params.id, it.item_id || null, it.item_name_snapshot || it.name, it.hsn || null, it.qty, it.unit || 'Pcs', it.price, it.gst_rate || 0, lineBase + lineGst]
      );
    }
    await client.query('COMMIT');
    const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// POST cancel invoice (soft delete)
router.post('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE invoices SET status='Cancelled', updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
