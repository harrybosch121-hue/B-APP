const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { XMLParser } = require('fast-xml-parser');
const { pool } = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true,
  parseTagValue: true,
});

const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

const parseGstRate = (stptName) => {
  if (!stptName) return 0;
  const m = String(stptName).match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : 0;
};

// Convert "01-04-2026" or "2026-04-01" to ISO date
const toIsoDate = (d) => {
  if (!d) return new Date().toISOString().slice(0, 10);
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
};

// POST /api/import/busy  (multipart: file)
router.post('/busy', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  let parsed;
  try {
    parsed = xmlParser.parse(req.file.buffer.toString('utf-8'));
  } catch (err) {
    return res.status(400).json({ error: 'Invalid XML: ' + err.message });
  }

  // Locate sales nodes (Busy DAT root: <BusyData><Sales><Sale>...)
  const root = parsed.BusyData || parsed.busydata || parsed;
  const salesContainer = root.Sales || root.sales || {};
  const sales = asArray(salesContainer.Sale || salesContainer.sale);
  if (sales.length === 0) {
    return res.status(400).json({ error: 'No <Sale> entries found in file' });
  }

  const stats = { totalInFile: sales.length, imported: 0, skippedExisting: 0, partiesCreated: 0, itemsCreated: 0, errors: [] };
  const client = await pool.connect();

  try {
    for (const sale of sales) {
      try {
        const vchNo = sale.VchNo || sale.vchNo;
        if (!vchNo) { stats.errors.push('Missing VchNo'); continue; }

        // Skip if already imported
        const { rows: existing } = await client.query(
          `SELECT id FROM invoices WHERE source = 'Busy' AND invoice_no = $1`,
          [parseInt(vchNo, 10)]
        );
        if (existing[0]) { stats.skippedExisting++; continue; }

        const partyName = (sale.PartyName || sale.partyName || 'Cash').toString().trim();
        const date = toIsoDate(sale.Date || sale.date);
        const stptName = sale.STPTName || sale.stptName || '';
        const gstRate = parseGstRate(stptName);

        // Find or create party
        let partyId;
        const { rows: pRows } = await client.query('SELECT id FROM parties WHERE name = $1', [partyName]);
        if (pRows[0]) {
          partyId = pRows[0].id;
        } else {
          partyId = randomUUID();
          await client.query(
            `INSERT INTO parties (id, name, party_type) VALUES ($1, $2, 'Customer')`,
            [partyId, partyName]
          );
          stats.partiesCreated++;
        }

        // Item entries: Busy uses ItemEntries > ItemEntry, but fallbacks too
        const itemEntriesNode = sale.ItemEntries || sale.itemEntries || {};
        let lineEntries = asArray(itemEntriesNode.ItemEntry || itemEntriesNode.itemEntry);
        if (lineEntries.length === 0) {
          // Single item flat
          if (sale.ItemName || sale.itemName) {
            lineEntries = [{
              ItemName: sale.ItemName || sale.itemName,
              Qty: sale.Qty || sale.qty || 1,
              Price: sale.Price || sale.price || 0,
            }];
          }
        }

        let subtotal = 0;
        let gstAmount = 0;
        const lineRows = [];

        for (const le of lineEntries) {
          const itemName = (le.ItemName || le.itemName || 'Unknown').toString().trim();
          const qty = parseFloat(le.Qty || le.qty || 1);
          const price = parseFloat(le.Price || le.price || 0);
          const lineRate = le.STPTName ? parseGstRate(le.STPTName) : gstRate;
          const lineBase = qty * price;
          const lineGst = lineBase * (lineRate / 100);
          subtotal += lineBase;
          gstAmount += lineGst;

          // Find or create item
          let itemId;
          const { rows: iRows } = await client.query('SELECT id FROM items WHERE name = $1', [itemName]);
          if (iRows[0]) {
            itemId = iRows[0].id;
          } else {
            itemId = randomUUID();
            await client.query(
              `INSERT INTO items (id, name, default_price, gst_rate) VALUES ($1, $2, $3, $4)`,
              [itemId, itemName, price, lineRate || 18]
            );
            stats.itemsCreated++;
          }

          lineRows.push({ itemId, itemName, qty, price, gstRate: lineRate, lineTotal: lineBase + lineGst, hsn: le.HSN || le.hsn || null, unit: le.Unit || le.unit || 'Pcs' });
        }

        const total = subtotal + gstAmount;
        const paymentMode = (sale.CashCredit || '').toString().toLowerCase().includes('credit') ? 'Credit' : 'Cash';
        const paid = paymentMode === 'Cash' ? total : 0;

        await client.query('BEGIN');
        const invoiceId = randomUUID();
        await client.query(
          `INSERT INTO invoices (id, invoice_no, date, party_id, payment_mode, subtotal, gst_amount, total, paid_amount, status, source, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Active', 'Busy', $10)`,
          [invoiceId, parseInt(vchNo, 10), date, partyId, paymentMode, subtotal, gstAmount, total, paid, 'Imported from Busy DAT']
        );
        for (const lr of lineRows) {
          await client.query(
            `INSERT INTO invoice_items (id, invoice_id, item_id, item_name_snapshot, hsn, qty, unit, price, gst_rate, line_total)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [randomUUID(), invoiceId, lr.itemId, lr.itemName, lr.hsn, lr.qty, lr.unit, lr.price, lr.gstRate, lr.lineTotal]
          );
        }
        if (paid > 0) {
          await client.query(
            `INSERT INTO payments (id, party_id, invoice_id, amount, mode, date, notes)
             VALUES ($1, $2, $3, $4, $5, $6, 'Auto from Busy import')`,
            [randomUUID(), partyId, invoiceId, paid, paymentMode, date]
          );
        }
        await client.query('COMMIT');
        stats.imported++;
      } catch (innerErr) {
        await client.query('ROLLBACK').catch(() => {});
        stats.errors.push(`Sale ${sale.VchNo || '?'}: ${innerErr.message}`);
      }
    }

    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message, stats });
  } finally {
    client.release();
  }
});

module.exports = router;
