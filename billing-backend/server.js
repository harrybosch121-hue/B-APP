require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');

const authRoutes = require('./routes/auth');
const partiesRoutes = require('./routes/parties');
const itemsRoutes = require('./routes/items');
const invoicesRoutes = require('./routes/invoices');
const paymentsRoutes = require('./routes/payments');
const reportsRoutes = require('./routes/reports');
const importBusyRoutes = require('./routes/import-busy');
const backupRoutes = require('./routes/backup');

const app = express();
const PORT = process.env.PORT || 3002;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '20mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'billing-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/parties', partiesRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/import', importBusyRoutes);
app.use('/api/backup', backupRoutes);

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

(async () => {
  try {
    await initDb();
    app.listen(PORT, () => console.log(`Billing backend listening on :${PORT}`));
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
})();
