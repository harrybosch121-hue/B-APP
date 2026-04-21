const express = require('express');
const { randomUUID } = require('crypto');
const { pool } = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// GET all items (with computed current stock = opening - sum invoiced qty)
router.get('/', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT i.*,
        i.opening_stock - COALESCE((
          SELECT SUM(ii.qty) FROM invoice_items ii
          JOIN invoices iv ON iv.id = ii.invoice_id
          WHERE ii.item_id = i.id AND iv.status = 'Active'
        ), 0) AS current_stock
      FROM items i
      ORDER BY i.name
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET single item with customer price overrides
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows: itemRows } = await pool.query('SELECT * FROM items WHERE id = $1', [req.params.id]);
    const item = itemRows[0];
    if (!item) return res.status(404).json({ error: 'Item not found' });
    const { rows: priceRows } = await pool.query(
      `SELECT cp.id, cp.party_id, cp.price, p.name AS party_name
       FROM customer_prices cp JOIN parties p ON p.id = cp.party_id
       WHERE cp.item_id = $1 ORDER BY p.name`,
      [req.params.id]
    );
    res.json({ ...item, customerPrices: priceRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create item
router.post('/', requireAuth, async (req, res) => {
  const { name, print_name, hsn, unit, default_price, purchase_price, opening_stock, gst_rate, category, low_stock_threshold, linked_tile_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  try {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO items (id, name, print_name, hsn, unit, default_price, purchase_price, opening_stock, gst_rate, category, low_stock_threshold, linked_tile_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, name, print_name || null, hsn || null, unit || 'Pcs', default_price || 0, purchase_price || 0, opening_stock || 0, gst_rate || 18, category || null, low_stock_threshold || 0, linked_tile_id || null]
    );
    const { rows } = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Item with this name already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT update item
router.put('/:id', requireAuth, async (req, res) => {
  const { name, print_name, hsn, unit, default_price, purchase_price, opening_stock, gst_rate, category, low_stock_threshold, linked_tile_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE items SET name=$1, print_name=$2, hsn=$3, unit=$4, default_price=$5, purchase_price=$6, opening_stock=$7, gst_rate=$8, category=$9, low_stock_threshold=$10, linked_tile_id=$11
       WHERE id=$12 RETURNING *`,
      [name, print_name || null, hsn, unit, default_price || 0, purchase_price || 0, opening_stock || 0, gst_rate || 18, category, low_stock_threshold || 0, linked_tile_id || null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET effective price for an item+party (override or default)
router.get('/:id/price/:partyId', requireAuth, async (req, res) => {
  try {
    const { rows: cp } = await pool.query(
      'SELECT price FROM customer_prices WHERE item_id = $1 AND party_id = $2',
      [req.params.id, req.params.partyId]
    );
    if (cp[0]) return res.json({ price: cp[0].price, source: 'customer' });
    const { rows: it } = await pool.query('SELECT default_price FROM items WHERE id = $1', [req.params.id]);
    if (!it[0]) return res.status(404).json({ error: 'Item not found' });
    res.json({ price: it[0].default_price, source: 'default' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT upsert customer price override
router.put('/:id/price/:partyId', requireAuth, async (req, res) => {
  const { price } = req.body;
  if (price === undefined || price === null) return res.status(400).json({ error: 'Price required' });
  try {
    await pool.query(
      `INSERT INTO customer_prices (id, party_id, item_id, price)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (party_id, item_id) DO UPDATE SET price = EXCLUDED.price`,
      [randomUUID(), req.params.partyId, req.params.id, price]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE customer price override
router.delete('/:id/price/:partyId', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM customer_prices WHERE item_id = $1 AND party_id = $2', [req.params.id, req.params.partyId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
