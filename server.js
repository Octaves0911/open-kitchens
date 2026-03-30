const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Logs ──────────────────────────────────────────────────────────────────────
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

function log(level, message, meta = {}) {
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...meta });
  fs.appendFileSync(path.join(logsDir, 'app.log'), entry + '\n');
  if (level === 'error') console.error(entry);
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  log('info', 'request', { method: req.method, url: req.url, ip: req.ip });
  next();
});
app.use(express.json());
// Serve static assets but NOT index.html (it's served via route with token injection)
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ── Database (init on startup) ────────────────────────────────────────────────
require('./db/database');  // runs CREATE TABLE IF NOT EXISTS on first boot

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/addresses', require('./routes/addresses'));
app.use('/api/cart',      require('./routes/cart'));

// Legacy pincode endpoint (kept for backwards compat)
app.post('/api/check-pincode', (req, res) => {
  const zones = ['560024','560064','560080','560032','560054','560013','560022','560003','560010','560045'];
  const { pincode } = req.body;
  res.json({ available: zones.includes(String(pincode)), pincode });
});

// Order endpoint
app.post('/api/order', (req, res) => {
  const orderId = 'OK' + Date.now().toString().slice(-6);
  log('info', 'order_placed', { orderId, items: req.body.items });
  res.json({ success: true, orderId, estimatedTime: 30 });
});

// ── Page Routes ───────────────────────────────────────────────────────────────
// index.html — inject Mapbox token from env at serve time (keeps token out of source)
const INDEX_TEMPLATE = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const MAPBOX_TOKEN   = process.env.MAPBOX_TOKEN || '';
app.get('/', (req, res) => {
  const html = INDEX_TEMPLATE.replace('__MAPBOX_TOKEN__', MAPBOX_TOKEN);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});
app.get('/menu',       (req, res) => res.redirect(301, '/#menu'));
app.get('/checkout',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'checkout.html')));
app.get('/tracking',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'tracking.html')));
app.get('/restaurant', (req, res) => res.sendFile(path.join(__dirname, 'public', 'restaurant.html')));
app.get('/rider',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'rider.html')));
app.get('/why-us',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'why-us.html')));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', app: 'Open Kitchens', version: '1.1.0' }));

app.listen(PORT, '0.0.0.0', () => {
  log('info', 'server_started', { port: PORT });
  console.log(`Open Kitchens running on port ${PORT}`);
});
