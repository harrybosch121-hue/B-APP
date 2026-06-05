const express = require('express');
const { pool } = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Daybook: invoices + payments + expenses for a date range
router.get('/daybook', requireAuth, async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  try {
    const { rows: invoices } = await pool.query(
      `SELECT i.id, i.invoice_no, i.date, i.payment_mode, i.total, i.status, p.name AS party_name
       FROM invoices i LEFT JOIN parties p ON p.id = i.party_id
       WHERE i.date BETWEEN $1 AND $2 ORDER BY i.date, i.invoice_no`,
      [from, to]
    );
    const { rows: payments } = await pool.query(
      `SELECT pay.id, pay.date, pay.amount, pay.mode, pay.notes, p.name AS party_name
       FROM payments pay LEFT JOIN parties p ON p.id = pay.party_id
       WHERE pay.date BETWEEN $1 AND $2 ORDER BY pay.date`,
      [from, to]
    );
    const { rows: expenses } = await pool.query(
      `SELECT * FROM expenses WHERE date BETWEEN $1 AND $2 ORDER BY date`,
      [from, to]
    );
    res.json({ invoices, payments, expenses });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Sales register
router.get('/sales-register', requireAuth, async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  try {
    const { rows } = await pool.query(
      `SELECT i.invoice_no, i.date, p.name AS party_name, p.gstin,
              i.subtotal, i.gst_amount, i.total, i.payment_mode, i.status
       FROM invoices i LEFT JOIN parties p ON p.id = i.party_id
       WHERE i.date BETWEEN $1 AND $2
       ORDER BY i.date, i.invoice_no`,
      [from, to]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Item-wise sales
router.get('/item-sales', requireAuth, async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  try {
    const { rows } = await pool.query(
      `SELECT ii.item_name_snapshot AS item_name,
              SUM(ii.qty)::float AS total_qty,
              SUM(ii.line_total)::float AS total_amount,
              COUNT(DISTINCT ii.invoice_id) AS invoice_count
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       WHERE i.date BETWEEN $1 AND $2 AND i.status = 'Active'
       GROUP BY ii.item_name_snapshot
       ORDER BY total_amount DESC`,
      [from, to]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Top customers (with mode filter)
router.get('/top-customers', requireAuth, async (req, res) => {
  const { from, to, mode, limit } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const params = [from, to];
  let modeCond = '';
  if (mode) { params.push(mode); modeCond = `AND i.payment_mode = $${params.length}`; }
  const lim = parseInt(limit, 10) || 20;
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name,
              SUM(i.total)::float AS total_business,
              COUNT(i.id) AS invoice_count
       FROM invoices i JOIN parties p ON p.id = i.party_id
       WHERE i.date BETWEEN $1 AND $2 AND i.status = 'Active' ${modeCond}
       GROUP BY p.id, p.name
       ORDER BY total_business DESC
       LIMIT ${lim}`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// P&L (very simple: sales - expenses)
router.get('/pl', requireAuth, async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  try {
    const { rows: sales } = await pool.query(
      `SELECT COALESCE(SUM(subtotal),0)::float AS sales_subtotal,
              COALESCE(SUM(gst_amount),0)::float AS sales_gst,
              COALESCE(SUM(total),0)::float AS sales_total
       FROM invoices WHERE date BETWEEN $1 AND $2 AND status = 'Active'`,
      [from, to]
    );
    const { rows: exp } = await pool.query(
      `SELECT COALESCE(SUM(amount),0)::float AS total_expenses FROM expenses WHERE date BETWEEN $1 AND $2`,
      [from, to]
    );
    const profit = sales[0].sales_subtotal - exp[0].total_expenses;
    res.json({ ...sales[0], ...exp[0], profit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GSTR-1 summary (B2B grouped by GSTIN, B2C aggregated)
router.get('/gstr1', requireAuth, async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  try {
    const { rows: b2b } = await pool.query(
      `SELECT p.gstin, p.name AS party_name,
              SUM(i.subtotal)::float AS taxable, SUM(i.gst_amount)::float AS gst, SUM(i.total)::float AS total,
              COUNT(i.id) AS invoice_count
       FROM invoices i JOIN parties p ON p.id = i.party_id
       WHERE i.date BETWEEN $1 AND $2 AND i.status = 'Active' AND p.gstin IS NOT NULL AND p.gstin <> ''
       GROUP BY p.gstin, p.name
       ORDER BY total DESC`,
      [from, to]
    );
    const { rows: b2c } = await pool.query(
      `SELECT COALESCE(SUM(i.subtotal),0)::float AS taxable, COALESCE(SUM(i.gst_amount),0)::float AS gst, COALESCE(SUM(i.total),0)::float AS total
       FROM invoices i LEFT JOIN parties p ON p.id = i.party_id
       WHERE i.date BETWEEN $1 AND $2 AND i.status = 'Active' AND (p.gstin IS NULL OR p.gstin = '')`,
      [from, to]
    );
    const { rows: byRate } = await pool.query(
      `SELECT ii.gst_rate,
              SUM(ii.qty * ii.price)::float AS taxable,
              SUM(ii.qty * ii.price * ii.gst_rate / 100)::float AS gst
       FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
       WHERE i.date BETWEEN $1 AND $2 AND i.status = 'Active'
       GROUP BY ii.gst_rate ORDER BY ii.gst_rate`,
      [from, to]
    );
    res.json({ b2b, b2c: b2c[0], byRate });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Dashboard summary
router.get('/dashboard', requireAuth, async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + '01';
    const { rows: todayRows } = await pool.query(
      `SELECT COALESCE(SUM(total),0)::float AS sales, COUNT(*) AS invoice_count
       FROM invoices WHERE date = $1 AND status = 'Active'`,
      [today]
    );
    const { rows: monthRows } = await pool.query(
      `SELECT COALESCE(SUM(total),0)::float AS sales, COUNT(*) AS invoice_count
       FROM invoices WHERE date BETWEEN $1 AND $2 AND status = 'Active'`,
      [monthStart, today]
    );
    const { rows: outstandingRows } = await pool.query(
      `SELECT COALESCE(SUM(total - paid_amount),0)::float AS outstanding
       FROM invoices WHERE status = 'Active' AND payment_mode = 'Credit'`
    );
    const { rows: parties } = await pool.query(`SELECT COUNT(*)::int AS c FROM parties`);
    const { rows: items } = await pool.query(`SELECT COUNT(*)::int AS c FROM items`);
    res.json({
      today: todayRows[0],
      month: monthRows[0],
      outstanding: outstandingRows[0].outstanding,
      partiesCount: parties[0].c,
      itemsCount: items[0].c,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
