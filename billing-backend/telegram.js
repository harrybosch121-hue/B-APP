const { gzip } = require('zlib');
const { promisify } = require('util');
const gzipAsync = promisify(gzip);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8737312570:AAGRDTxgja5cL-KkAoPHqfZ54Nf0_XMoZ_c';
const CHAT_IDS = (process.env.TELEGRAM_CHAT_IDS || '5733576801,8194958384').split(',').map(s => s.trim());

async function sendDocument(chatId, buffer, filename, caption) {
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('caption', caption);
  formData.append('document', new Blob([buffer], { type: 'application/gzip' }), filename);
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
    method: 'POST', body: formData,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Telegram sendDocument failed: ${txt}`);
  }
  return res.json();
}

async function sendBackup(pool) {
  try {
    const TABLES = ['users', 'parties', 'items', 'customer_prices', 'invoices', 'invoice_items', 'payments', 'expenses'];
    const dump = { version: 1, service: 'billing', generatedAt: new Date().toISOString(), tables: {} };
    for (const t of TABLES) {
      try {
        const { rows } = await pool.query(`SELECT * FROM ${t} ORDER BY 1`);
        dump.tables[t] = rows;
      } catch { dump.tables[t] = []; }
    }

    const json = JSON.stringify(dump, null, 2);
    const compressed = await gzipAsync(Buffer.from(json, 'utf-8'));
    const date = new Date().toISOString().slice(0, 10);
    const filename = `billing-backup-${date}.json.gz`;
    const caption = `💰 Billing Backup — ${date}\nInvoices: ${dump.tables.invoices?.length ?? 0} | Items: ${dump.tables.items?.length ?? 0} | Parties: ${dump.tables.parties?.length ?? 0}`;

    for (const chatId of CHAT_IDS) {
      await sendDocument(chatId, compressed, filename, caption);
      console.log(`Telegram billing backup sent to ${chatId}`);
    }
    return { ok: true, invoices: dump.tables.invoices?.length };
  } catch (err) {
    console.error('Telegram billing backup error:', err.message);
    throw err;
  }
}

module.exports = { sendBackup };

