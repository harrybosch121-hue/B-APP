const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { XMLParser } = require('fast-xml-parser');
const { pool } = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true,
  parseTagValue: true,
  // Busy DAT files use thousands of &lt;/&gt; entities (e.g. "&lt;&lt;---None---&gt;&gt;" in every Item's
  // TaxCategory). fast-xml-parser caps entity expansion at 1000 per doc and aborts otherwise.
  // We don't need decoded <,> anywhere in our extraction, so skip entity processing entirely.
  processEntities: false,
  htmlEntities: false,
});

const asArray = (v) => (Array.isArray(v) ? v : v != null && v !== '' ? [v] : []);
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// Extract GST rate from "I/GST-18%", "GST 18%", "18%" etc.
const parseGstRate = (s) => {
  if (s == null) return 0;
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : 0;
};

// "I/" prefix on STPTName means GST is INCLUSIVE in line Amt (Busy convention)
const isInclusiveTax = (s) => {
  if (!s) return false;
  const x = String(s).toUpperCase();
  return x.startsWith('I/') || x.includes('INCL');
};

// "01-04-2026" or "2026-04-01" -> "2026-04-01"
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

  // Busy DAT root may contain vouchers (<Sales><Sale>, <SlRts><SaleReturn>) and/or masters (<Accounts><Account>, <Items><Item>)
  const root = parsed.BusyData || parsed.busydata || parsed;
  const salesContainer = root.Sales || root.sales || {};
  const sales = asArray(salesContainer.Sale || salesContainer.sale);
  const returnsContainer = root.SlRts || root.slRts || root.SaleReturns || {};
  const saleReturns = asArray(returnsContainer.SaleReturn || returnsContainer.saleReturn);
  const accountsContainer = root.Accounts || root.accounts || {};
  const masterAccounts = asArray(accountsContainer.Account || accountsContainer.account);
  const itemsContainer = root.Items || root.items || {};
  const masterItems = asArray(itemsContainer.Item || itemsContainer.item);

  if (sales.length === 0 && saleReturns.length === 0 && masterAccounts.length === 0 && masterItems.length === 0) {
    return res.status(400).json({ error: 'No <Sale>, <SaleReturn>, <Account> or <Item> entries found in file' });
  }

  const stats = {
    totalInFile: sales.length,
    imported: 0,
    skippedExisting: 0,
    partiesCreated: 0,
    itemsCreated: 0,
    returns: { totalInFile: saleReturns.length, imported: 0, skippedExisting: 0 },
    masters: { accountsInFile: masterAccounts.length, itemsInFile: masterItems.length, partiesCreated: 0, partiesSkippedExisting: 0, partiesSkippedNonParty: 0, itemsCreated: 0, itemsSkippedExisting: 0 },
    errors: [],
    skipped: [],
  };
  const client = await pool.connect();

  try {
    // ---------- MASTERS: Accounts (parties) ----------
    for (const acc of masterAccounts) {
      try {
        const name = String(acc.Name || acc.name || '').trim();
        if (!name) continue;

        const parentGroup = String(acc.ParentGroup || acc.parentGroup || '').trim();
        const pgLower = parentGroup.toLowerCase();
        let partyType = null;
        if (pgLower.includes('debtor') || pgLower.includes('customer')) partyType = 'Customer';
        else if (pgLower.includes('creditor') || pgLower.includes('supplier') || pgLower.includes('vendor')) partyType = 'Supplier';
        else { stats.masters.partiesSkippedNonParty++; continue; }

        const { rows: existing } = await client.query('SELECT id FROM parties WHERE name = $1', [name]);
        if (existing[0]) { stats.masters.partiesSkippedExisting++; continue; }

        const addr = acc.Address || acc.address || {};
        const addrParts = [
          addr.Address1 || addr.address1, addr.Address2 || addr.address2, addr.Address3 || addr.address3,
          addr.CityName || addr.cityName, addr.StateName || addr.stateName, addr.PinCode || addr.pinCode,
        ].map((v) => (v == null ? '' : String(v).trim())).filter((v) => v && v !== '---Others---');
        const address = addrParts.join(', ') || null;

        const phone = String(addr.MobileNo || addr.mobileNo || addr.Phone1 || addr.phone1 || addr.Phone || acc.MobileNo || '').trim() || null;
        const gstin = String(acc.GSTIN || acc.gstin || acc.PartyGSTIN || acc.GSTNo || addr.GSTIN || '').trim() || null;
        // Busy stores OPBal negative for credit (party owes us). Flip sign so positive = receivable.
        const opening = -num(acc.OPBal ?? acc.opBal);
        const stateRaw = String(addr.StateName || addr.stateName || '').trim();
        const state = stateRaw && stateRaw !== '---Others---' ? stateRaw : null;
        const printName = String(acc.PrintName || acc.printName || '').trim() || null;

        await client.query(
          `INSERT INTO parties (id, name, print_name, phone, address, state, gstin, party_type, opening_balance)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [randomUUID(), name, printName, phone, address, state, gstin, partyType, opening]
        );
        stats.masters.partiesCreated++;
      } catch (e) {
        stats.errors.push(`Account ${acc.Name || '?'}: ${e.message}`);
      }
    }

    // ---------- MASTERS: Items ----------
    for (const it of masterItems) {
      try {
        const name = String(it.Name || it.name || '').trim();
        if (!name) continue;

        const { rows: existing } = await client.query('SELECT id FROM items WHERE name = $1', [name]);
        if (existing[0]) { stats.masters.itemsSkippedExisting++; continue; }

        const unit = String(it.MainUnit || it.mainUnit || it.Unit || 'Pcs').trim() || 'Pcs';
        const mrp = num(it.MRP ?? it.mrp);
        const purchase = num(it.PurchasePrice ?? it.purchasePrice);
        const defaultPrice = mrp > 0 ? mrp : purchase;
        const gstRate = parseGstRate(it.TaxCategory || it.taxCategory);
        const hsn = String(it.HSNCode || it.hsnCode || it.HSN || '').trim() || null;
        const category = String(it.ParentGroup || it.parentGroup || '').trim() || null;
        const printName = String(it.PrintName || it.printName || '').trim() || null;
        const openingStock = num(it.OPStockInMainUnit ?? it.opStockInMainUnit);

        await client.query(
          `INSERT INTO items (id, name, print_name, hsn, unit, default_price, purchase_price, opening_stock, gst_rate, category)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [randomUUID(), name, printName, hsn, unit, defaultPrice, purchase, openingStock, gstRate, category]
        );
        stats.masters.itemsCreated++;
      } catch (e) {
        stats.errors.push(`Item ${it.Name || '?'}: ${e.message}`);
      }
    }

    // ---------- VOUCHERS ----------
    const processVoucher = async (sale, voucherType) => {
      const isReturn = voucherType === 'SaleReturn';
      const labelPrefix = isReturn ? 'SaleReturn' : 'Sale';
      try {
        const vchNoRaw = sale.VchNo ?? sale.vchNo;
        if (vchNoRaw === undefined || vchNoRaw === null || vchNoRaw === '') {
          stats.skipped.push(`${labelPrefix}: missing VchNo (non-standard voucher series)`);
          if (isReturn) stats.returns.skippedExisting++; else stats.skippedExisting++;
          return;
        }
        const vchNo = parseInt(vchNoRaw, 10);
        if (!Number.isFinite(vchNo)) {
          stats.skipped.push(`${labelPrefix} "${vchNoRaw}": non-numeric VchNo (alternative series)`);
          if (isReturn) stats.returns.skippedExisting++; else stats.skippedExisting++;
          return;
        }

        // Idempotent: skip if already imported
        const { rows: existing } = await client.query(
          `SELECT id FROM invoices WHERE source = 'Busy' AND voucher_type = $1 AND invoice_no = $2`,
          [voucherType, vchNo]
        );
        if (existing[0]) {
          if (isReturn) stats.returns.skippedExisting++; else stats.skippedExisting++;
          return;
        }

        // Party — Busy stores under BillingDetails.PartyName, fallback MasterName1
        const billing = sale.BillingDetails || sale.billingDetails || {};
        const partyName = String(
          billing.PartyName || billing.partyName ||
          sale.MasterName1 || sale.masterName1 ||
          'Cash'
        ).trim() || 'Cash';

        const date = toIsoDate(sale.Date || sale.date);
        const headerStpt = sale.STPTName || sale.stptName || '';
        const headerInclusive = isInclusiveTax(headerStpt);
        const headerRate = parseGstRate(headerStpt);

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

        // Lines — Busy uses <ItemEntries><ItemDetail>...</ItemDetail></ItemEntries>
        const itemEntriesNode = sale.ItemEntries || sale.itemEntries || {};
        let lineEntries = asArray(
          itemEntriesNode.ItemDetail || itemEntriesNode.itemDetail ||
          itemEntriesNode.ItemEntry || itemEntriesNode.itemEntry
        );
        if (lineEntries.length === 0 && (sale.ItemName || sale.itemName)) {
          lineEntries = [{
            ItemName: sale.ItemName || sale.itemName,
            Qty: sale.Qty || sale.qty || 1,
            Price: sale.Price || sale.price || 0,
            Amt: sale.Amt || sale.amt,
          }];
        }

        let subtotal = 0;     // taxable value
        let gstAmount = 0;
        let lineGrossSum = 0; // sum of line totals (incl. GST)
        const lineRows = [];

        for (const le of lineEntries) {
          const itemName = String(le.ItemName || le.itemName || 'Unknown').trim() || 'Unknown';
          const qty = num(le.Qty ?? le.qty ?? le.QtyMainUnit ?? 1) || 1;
          const price = num(le.Price ?? le.price ?? le.ListPrice);
          const amt = num(le.Amt ?? le.amt);
          const nett = num(le.NettAmount ?? le.nettAmount);

          // Per-line ItemTaxCategory ("GST 18%") overrides header rate
          const lineTaxStr = le.ItemTaxCategory || le.itemTaxCategory || '';
          let lineRate = parseGstRate(lineTaxStr);
          if (!lineRate) lineRate = headerRate;
          // Inclusive flag is determined by header STPTName regardless
          const lineInclusive = headerInclusive;

          let lineBase, lineGst, lineTotal;
          if (lineInclusive && amt > 0) {
            // Amt = gross (incl GST). Use NettAmount when present, else derive.
            lineBase = nett > 0 ? nett : (lineRate ? amt / (1 + lineRate / 100) : amt);
            lineGst = Math.max(0, amt - lineBase);
            lineTotal = amt;
          } else {
            // Exclusive: Amt = taxable (or qty*price), GST added.
            lineBase = amt > 0 ? amt : qty * price;
            lineGst = lineBase * (lineRate / 100);
            lineTotal = lineBase + lineGst;
          }
          subtotal += lineBase;
          gstAmount += lineGst;
          lineGrossSum += lineTotal;

          // Find or create item
          let itemId;
          const { rows: iRows } = await client.query('SELECT id FROM items WHERE name = $1', [itemName]);
          if (iRows[0]) {
            itemId = iRows[0].id;
          } else {
            itemId = randomUUID();
            await client.query(
              `INSERT INTO items (id, name, default_price, gst_rate) VALUES ($1, $2, $3, $4)`,
              [itemId, itemName, price, lineRate || 0]
            );
            stats.itemsCreated++;
          }

          lineRows.push({
            itemId,
            itemName,
            qty,
            price,
            gstRate: lineRate,
            lineTotal,
            hsn: le.HSN || le.hsn || null,
            unit: le.UnitName || le.unitName || le.Unit || le.unit || 'Pcs',
          });
        }

        // Bill sundries (Discount, Round-off, etc.)
        let sundryTotal = 0;
        const sundriesNode = sale.BillSundries || sale.billSundries || {};
        const sundries = asArray(sundriesNode.BSDetail || sundriesNode.bSDetail || sundriesNode.bsDetail);
        for (const s of sundries) {
          const name = String(s.BSName || s.bsName || '').toLowerCase();
          const amount = num(s.Amt ?? s.amt);
          if (!amount) continue;
          if (name.includes('disc')) sundryTotal -= amount;
          else sundryTotal += amount;
        }

        // Prefer Busy's authoritative total when present
        const busyTotal = num(sale.tmpTotalAmt ?? sale.tmpSalePurcAmt);
        const total = busyTotal > 0 ? busyTotal : Math.max(0, lineGrossSum + sundryTotal);

        // Payment mode
        const ofInfo = ((sale.VchOtherInfoDetails || {}).OFInfo) || {};
        const ofText = String(ofInfo.OF1 || '').toUpperCase();
        const cashAmt = num(((sale.POSVchData || {}).CashAmt));
        const isCredit = ofText.includes('CREDIT') && cashAmt <= 0;
        const paymentMode = isCredit ? 'Credit' : 'Cash';
        const paid = paymentMode === 'Cash' ? total : 0;

        await client.query('BEGIN');
        const invoiceId = randomUUID();
        // For SaleReturn we negate the totals so outstanding math just sums everything up.
        const sign = isReturn ? -1 : 1;
        const noteText = isReturn ? 'Sale Return imported from Busy DAT' : 'Imported from Busy DAT';
        await client.query(
          `INSERT INTO invoices (id, invoice_no, voucher_type, date, party_id, payment_mode, subtotal, gst_amount, total, paid_amount, status, source, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Active', 'Busy', $11)`,
          [invoiceId, vchNo, voucherType, date, partyId, paymentMode, sign * subtotal, sign * gstAmount, sign * total, sign * paid, noteText]
        );
        for (const lr of lineRows) {
          await client.query(
            `INSERT INTO invoice_items (id, invoice_id, item_id, item_name_snapshot, hsn, qty, unit, price, gst_rate, line_total)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [randomUUID(), invoiceId, lr.itemId, lr.itemName, lr.hsn, sign * lr.qty, lr.unit, lr.price, lr.gstRate, sign * lr.lineTotal]
          );
        }
        if (paid > 0) {
          await client.query(
            `INSERT INTO payments (id, party_id, invoice_id, amount, mode, date, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [randomUUID(), partyId, invoiceId, sign * paid, paymentMode, date, isReturn ? 'Auto-refund from Busy sale return' : 'Auto from Busy import']
          );
        }
        await client.query('COMMIT');
        if (isReturn) stats.returns.imported++; else stats.imported++;
      } catch (innerErr) {
        await client.query('ROLLBACK').catch(() => {});
        stats.errors.push(`${labelPrefix} ${sale.VchNo || '?'}: ${innerErr.message}`);
      }
    };

    for (const sale of sales)        await processVoucher(sale, 'Sale');
    for (const ret  of saleReturns)  await processVoucher(ret,  'SaleReturn');

    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message, stats });
  } finally {
    client.release();
  }
});

// POST /api/import/reset  — wipe all business data (keeps users)
router.post('/reset', requireAuth, async (_req, res) => {
  try {
    await pool.query(`TRUNCATE payments, invoice_items, invoices, customer_prices, items, parties, expenses RESTART IDENTITY CASCADE`);
    res.json({ ok: true, message: 'All business data wiped. Users preserved.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
