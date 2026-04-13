const express     = require('express');
const path        = require('path');
const fs          = require('fs');
const http        = require('http');
const compression = require('compression');
const { WebSocketServer } = require('ws');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3000;

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
// Gzip compression for all text responses (HTML, JS, CSS, JSON)
app.use(compression({ level: 6 }));
app.use(express.json());

// ── Database (before API routers) ─────────────────────────────────────────────
require('./db/database');

// ── WebSocket Server ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

// Map userId (string) → Set of live WebSocket connections
const userSockets = new Map();

wss.on('connection', (ws) => {
  let userId = null;
  ws.isAlive = true;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      // Client registers: { type:'register', userId }
      if (msg.type === 'register' && msg.userId) {
        userId = String(msg.userId);
        if (!userSockets.has(userId)) userSockets.set(userId, new Set());
        userSockets.get(userId).add(ws);
        ws.send(JSON.stringify({ type: 'registered', userId }));
      }
    } catch {}
  });

  ws.on('close', () => {
    if (userId && userSockets.has(userId)) {
      userSockets.get(userId).delete(ws);
      if (userSockets.get(userId).size === 0) userSockets.delete(userId);
    }
  });
});

// Heartbeat — drop stale connections every 30 s
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Globals used by restaurant route handlers
global.notifyUser = (userId, payload) => {
  const sockets = userSockets.get(String(userId));
  if (!sockets) return;
  const data = JSON.stringify(payload);
  sockets.forEach(ws => { if (ws.readyState === 1) ws.send(data); });
};

global.broadcastOrderUpdate = (orderId, status) => {
  const data = JSON.stringify({ type: 'order_update', orderId, status });
  wss.clients.forEach(ws => { if (ws.readyState === 1) ws.send(data); });
};

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/addresses',  require('./routes/addresses'));
app.use('/api/cart',       require('./routes/cart'));
app.use('/api/restaurant', require('./routes/restaurant'));
app.use('/api/public/live', require('./routes/public-live'));

// ── Public Menu & Offers API (restaurant_id=1) ───────────────────────────────
const db = require('./db/database');
const RESTAURANT_ID = 1;

// Public restaurant info — used by checkout for ETA, location, delivery settings
app.get('/api/restaurant-info', (req, res) => {
  const r = db.prepare(`
    SELECT name, address, tagline, cuisine_type, phone,
           lat, lng, max_delivery_km, prep_time_minutes,
           delivery_fee, min_order_amount, tax_percent, packaging_charge,
           opening_time, closing_time, is_accepting_orders
    FROM restaurants WHERE id=?
  `).get(RESTAURANT_ID);
  res.json({
    name:              r?.name               || 'Open Kitchens',
    address:           r?.address            || 'Bengaluru, Karnataka',
    tagline:           r?.tagline            || null,
    cuisine_type:      r?.cuisine_type       || null,
    phone:             r?.phone              || null,
    lat:               r?.lat               ?? null,
    lng:               r?.lng               ?? null,
    max_delivery_km:   r?.max_delivery_km   ?? 50,
    prep_minutes:      r?.prep_time_minutes ?? 20,
    delivery_fee:      r?.delivery_fee      ?? 0,
    min_order_amount:  r?.min_order_amount  ?? 0,
    tax_percent:       r?.tax_percent       ?? 5,
    packaging_charge:  r?.packaging_charge  ?? 20,
    opening_time:      r?.opening_time      || '09:00',
    closing_time:      r?.closing_time      || '22:00',
    is_accepting_orders: r?.is_accepting_orders ?? 1,
  });
});

app.get('/api/menu', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  const items = db.prepare(
    `SELECT * FROM menu_items WHERE restaurant_id=? AND is_available=1 ORDER BY sort_order, id`
  ).all(RESTAURANT_ID);
  res.json({ items: items.map(i => ({
    ...i,
    addons:   JSON.parse(i.addons_json  || '[]'),
    metadata: JSON.parse(i.metadata_json || '{}'),
    emoji:    JSON.parse(i.metadata_json || '{}').emoji || '🍽️'
  }))});
});

app.get('/api/offers', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  const now = new Date().toISOString();
  const offers = db.prepare(
    `SELECT id, code, title, description, discount_type, discount_value,
            min_order, max_discount, badge, emoji, old_price, image_url,
            valid_until, usage_count, usage_limit
     FROM offers
     WHERE restaurant_id=? AND is_active=1
       AND (valid_until IS NULL OR valid_until >= ?)
       AND (usage_limit IS NULL OR usage_count < usage_limit)
     ORDER BY created_at ASC`
  ).all(RESTAURANT_ID, now);
  res.json({ offers });
});

// Legacy pincode endpoint
app.post('/api/check-pincode', (req, res) => {
  const zones = ['560024','560064','560080','560032','560054','560013','560022','560003','560010','560045'];
  const { pincode } = req.body;
  res.json({ available: zones.includes(String(pincode)), pincode });
});

// Order placement
app.post('/api/order', (req, res) => {
  const orderId = 'OK' + Date.now().toString().slice(-6);
  log('info', 'order_placed', { orderId, items: req.body.items });
  res.json({ success: true, orderId, estimatedTime: 30 });
});

// ── Static assets (after all /api/* routes) ───────────────────────────────────
app.use('/images', express.static(path.join(__dirname, 'public', 'images'), {
  maxAge: '1y',
  immutable: true,
  index: false,
}));
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  maxAge: '1d',
  etag: true,
  lastModified: true,
}));

// ── Page Routes ───────────────────────────────────────────────────────────────
const MAPBOX_TOKEN   = process.env.MAPBOX_TOKEN || '';

app.get('/', (req, res) => {
  // Read fresh each request so file edits are reflected without restart
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')
                 .replace('__MAPBOX_TOKEN__', MAPBOX_TOKEN);
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
});

app.get('/menu',       (req, res) => res.redirect(301, '/#menu'));
app.get('/checkout',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'checkout.html')));
app.get('/tracking',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'tracking.html')));
app.get('/restaurant', (req, res) => res.sendFile(path.join(__dirname, 'public', 'restaurant.html')));
app.get('/stream',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'stream.html')));
app.get('/rider',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'rider.html')));
app.get('/why-us', (req, res) => res.sendFile(path.join(__dirname, 'public', 'why-us.html')));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', app: 'Open Kitchens', version: '1.2.0' }));

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  log('info', 'server_started', { port: PORT });
  console.log(`Open Kitchens running on port ${PORT}`);
});