/**
 * Open Kitchens — Restaurant Portal API Routes
 * Covers: orders, menu items, offers, restaurant config, live streams
 */
const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const multer  = require('multer');
const sharp   = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const db         = require('../db/database');
const hls        = require('../lib/hls-transcoder');
const liveAccess = require('../lib/live-stream-access');

/** ES2019 nullish coalescing equivalent (Node older than 14 has no `??`). */
function nullish(x, fallback) {
  return (x !== undefined && x !== null) ? x : fallback;
}

/** Customer-facing order shorthand: OK + 6-digit padded id (matches legacy confirmations). */
function formatOrderCustomerLabel(orderId) {
  if (orderId == null || Number.isNaN(Number(orderId))) return '—';
  return `OK${String(Number(orderId)).padStart(6, '0')}`;
}
const { requireAuth, signToken } = require('../middleware/auth');

// ── Optional S3 media storage ────────────────────────────────────────────────
const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL || '';
const AWS_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || '';
const S3_ENABLED = Boolean(S3_BUCKET && S3_PUBLIC_BASE_URL && AWS_REGION);

const s3 = S3_ENABLED ? new S3Client({ region: AWS_REGION }) : null;

function joinUrl(base, key) {
  const b = String(base || '').replace(/\/+$/, '');
  const k = String(key || '').replace(/^\/+/, '');
  return `${b}/${k}`;
}

/** Escape for double-quoted HTML attribute values (e.g. iframe src). */
function escapeHtmlAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function uploadWebpToS3({ key, bodyBuffer }) {
  if (!s3) throw new Error('S3 is not configured');
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: bodyBuffer,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return joinUrl(S3_PUBLIC_BASE_URL, key);
}

// ── Image upload helpers — memory storage + WebP conversion via sharp ─────────
// All uploads are converted to WebP (much smaller) before being saved to disk.
const RESIZE = {
  menu:   { width: 400, height: 300 },  // shown as card thumbnails
  offers: { width: 800, height: 400 },  // shown as banner images
};

function makeUploader(subdir, prefix) {
  const dir = path.join(__dirname, '..', 'public', 'images', subdir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Use memory storage — we'll write the file ourselves after WebP conversion
  const uploader = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // allow up to 10 MB raw upload
    fileFilter: (req, file, cb) => {
      if (/^image\/(jpeg|jpg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
      else cb(new Error('Only image files are allowed'));
    },
  });

  // Express middleware that runs after multer: converts buffer → WebP and
  // either uploads to S3 (if configured) or saves to disk.
  async function processImage(req, res, next) {
    if (!req.file) return next();
    try {
      const filename = `${prefix}_${Date.now()}.webp`;
      const dims     = RESIZE[subdir];
      let pipeline   = sharp(req.file.buffer);
      if (dims) pipeline = pipeline.resize(dims.width, dims.height, { fit: 'cover' });
      const webpBuffer = await pipeline.webp({ quality: 78, effort: 4 }).toBuffer();

      // Patch req.file so downstream handlers can read filename / URL
      req.file.filename = filename;
      req.file.mimetype = 'image/webp';
      req.file.buffer   = webpBuffer;

      if (S3_ENABLED) {
        const key = `${subdir}/${filename}`;
        req.file.publicUrl = await uploadWebpToS3({ key, bodyBuffer: webpBuffer });
        return next();
      }

      const destPath = path.join(dir, filename);
      await fs.promises.writeFile(destPath, webpBuffer);
      req.file.path = destPath;
      next();
    } catch (err) {
      next(err);
    }
  }

  // Return a combined middleware array [multer.single, processImage]
  return {
    single: (field) => [uploader.single(field), processImage],
  };
}

const upload      = makeUploader('menu',   'item');   // menu item images
const uploadOffer = makeUploader('offers', 'offer');  // offer images

// CSV upload (menu import)
const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3 MB
}).single('csv');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // double quote inside quoted field -> literal quote
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => String(s || '').trim());
}

function toBoolVeg(tag) {
  const t = String(tag || '').toLowerCase().trim();
  if (!t) return 1;
  if (t === 'veg' || t === 'vegetarian') return 1;
  return 0; // non veg / egg / anything else -> 0
}

function parseAddons(namesRaw, pricesRaw) {
  const names = String(namesRaw || '').trim();
  const prices = String(pricesRaw || '').trim();
  if (!names || names === '-' || names.toLowerCase() === 'na') return '[]';
  const nameParts = names.split(/[,|]/).map(s => s.trim()).filter(Boolean);
  const priceParts = prices && prices !== '-' ? prices.split(/[,|]/).map(s => s.trim()) : [];
  const arr = nameParts.map((n, idx) => ({
    name: n,
    price: Number(priceParts[idx] || 0) || 0,
  }));
  return JSON.stringify(arr);
}

// ── Simple restaurant auth guard (password from env or config) ────────────────
// For now accepts a shared secret header; replace with proper RBAC if needed
function requireRestaurant(req, res, next) {
  const raw    = req.headers['x-restaurant-secret'] || req.query.secret || '';
  const secret = decodeURIComponent(raw);
  const expected = process.env.RESTAURANT_SECRET || 'ok_restaurant_2025';
  if (secret === expected) return next();
  res.status(403).json({ error: 'Restaurant access denied' });
}

const RESTAURANT_ID = 1;

// ═══════════════════════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/restaurant/ratings — list stream feedback grouped by order (newest first)
router.get('/ratings', requireRestaurant, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        sf.order_id,
        sf.live_idea,
        sf.trust,
        sf.order_again,
        sf.created_at,
        o.status AS order_status,
        o.created_at AS order_created_at
      FROM stream_feedback sf
      LEFT JOIN orders o ON o.id = sf.order_id
      ORDER BY sf.created_at DESC
      LIMIT 200
    `).all();

    // Group by order_id for UI
    const byOrder = new Map();
    rows.forEach(r => {
      const oid = r.order_id;
      if (!byOrder.has(oid)) {
        byOrder.set(oid, {
          orderId: oid,
          orderLabel: formatOrderCustomerLabel(oid),
          orderStatus: r.order_status || null,
          orderCreatedAt: r.order_created_at || null,
          feedback: [],
        });
      }
      byOrder.get(oid).feedback.push({
        liveIdea: r.live_idea,
        trust: r.trust,
        orderAgain: r.order_again,
        createdAt: r.created_at,
      });
    });

    res.json({ orders: Array.from(byOrder.values()) });
  } catch (e) {
    console.error('[ratings]', e);
    res.status(500).json({ error: 'Failed to load ratings' });
  }
});

// GET /api/restaurant/orders — list all orders for this restaurant (newest first)
router.get('/orders', requireRestaurant, (req, res) => {
  const { status } = req.query;
  let rows;
  if (status) {
    rows = db.prepare(`SELECT o.*, u.name as user_name, u.phone as user_phone
                       FROM orders o LEFT JOIN users u ON u.id = o.user_id
                       WHERE o.restaurant_id=? AND o.status=?
                       ORDER BY o.created_at DESC`).all(RESTAURANT_ID, status);
  } else {
    rows = db.prepare(`SELECT o.*, u.name as user_name, u.phone as user_phone
                       FROM orders o LEFT JOIN users u ON u.id = o.user_id
                       WHERE o.restaurant_id=?
                       ORDER BY o.created_at DESC LIMIT 100`).all(RESTAURANT_ID);
  }
  const orders = rows.map(r => ({ ...r, items: JSON.parse(r.items_json || '[]') }));
  res.json({ orders });
});

// PATCH /api/restaurant/orders/:id — accept or decline
router.patch('/orders/:id', requireRestaurant, (req, res) => {
  const { status } = req.body; // 'accepted' | 'declined' | 'preparing' | 'ready' | 'dispatched'
  const allowed = ['accepted', 'declined', 'preparing', 'ready', 'dispatched', 'delivered'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const info = db.prepare('UPDATE orders SET status=? WHERE id=?').run(status, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Order not found' });
  // Notify connected WebSocket clients (via global wss attached by server.js)
  if (global.broadcastOrderUpdate) global.broadcastOrderUpdate(req.params.id, status);
  res.json({ success: true, orderId: req.params.id, status });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MENU ITEMS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/restaurant/menu — all items for this restaurant
router.get('/menu', requireRestaurant, (req, res) => {
  const items = db.prepare(
    'SELECT * FROM menu_items WHERE restaurant_id=? ORDER BY sort_order, id'
  ).all(RESTAURANT_ID);
  res.json({ items: items.map(i => ({
    ...i,
    addons:   JSON.parse(i.addons_json  || '[]'),
    metadata: JSON.parse(i.metadata_json || '{}'),
    emoji:    JSON.parse(i.metadata_json || '{}').emoji || '🍽️',
  }))});
});

// POST /api/restaurant/menu — add item (with optional image upload)
router.post('/menu', requireRestaurant, ...upload.single('image'), (req, res) => {
  const {
    name, category, description, price,
    is_veg = 1, is_available = 1, is_bestseller = 0, is_spicy = 0, is_fan_favourite = 0,
    addons = '[]', metadata = '{}'
  } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'name and price required' });
  const image_url = req.file
    ? (req.file.publicUrl || `/images/menu/${req.file.filename}`)
    : (req.body.image_url || null);
  const info = db.prepare(`
    INSERT INTO menu_items
      (restaurant_id, name, category, description, price, image_url,
       is_veg, is_available, is_bestseller, is_spicy, is_fan_favourite, addons_json, metadata_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    RESTAURANT_ID, name, category, description, parseFloat(price), image_url,
    Number(is_veg), Number(is_available), Number(is_bestseller), Number(is_spicy), Number(is_fan_favourite),
    addons, metadata);
  res.json({ success: true, id: info.lastInsertRowid });
});

// POST /api/restaurant/menu/import-csv — import menu items from CSV (Final Menu.csv format)
router.post('/menu/import-csv', requireRestaurant, uploadCsv, (req, res) => {
  try {
    if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'CSV file is required.' });
    const mode = String(req.body && req.body.mode || 'upsert');
    const doUpsert = mode !== 'insert_only';

    const text = req.file.buffer.toString('utf8');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return res.status(400).json({ error: 'CSV is empty.' });

    const header = parseCsvLine(lines[0]).map(h => h.toLowerCase());
    const idx = (name) => header.indexOf(String(name).toLowerCase());
    const iName = idx('Item name');
    const iCat = idx('Category');
    const iPrice = idx('Item price');
    const iDiet = idx('Dietary Tag (veg/non veg/egg)');
    const iDesc = idx('Item description');
    const iAddNames = idx('Add Ons');
    const iAddPrices = idx('Add on Prices');

    if (iName < 0 || iPrice < 0) {
      return res.status(400).json({ error: 'CSV header missing required columns (Item name, Item price).' });
    }

    const selectExisting = db.prepare(
      "SELECT id FROM menu_items WHERE restaurant_id=? AND name=? AND IFNULL(category,'')=IFNULL(?, '') LIMIT 1"
    );
    const insertItem = db.prepare(`
      INSERT INTO menu_items
        (restaurant_id, name, category, description, price, image_url,
         is_veg, is_available, is_bestseller, is_spicy, is_fan_favourite, addons_json, metadata_json, sort_order)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const updateItem = db.prepare(`
      UPDATE menu_items SET
        category=?,
        description=?,
        price=?,
        is_veg=?,
        addons_json=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND restaurant_id=?
    `);

    let added = 0, updated = 0, skipped = 0, failed = 0;

    const tx = db.transaction(() => {
      for (let li = 1; li < lines.length; li++) {
        try {
          const row = parseCsvLine(lines[li]);
          const name = String(row[iName] || '').trim();
          if (!name || name === '-') { skipped++; continue; }
          const category = iCat >= 0 ? String(row[iCat] || '').trim() : '';
          const price = Number(row[iPrice] || 0);
          if (!Number.isFinite(price) || price <= 0) { skipped++; continue; }
          const description = iDesc >= 0 ? String(row[iDesc] || '').trim() : '';
          const isVeg = iDiet >= 0 ? toBoolVeg(row[iDiet]) : 1;
          const addonsJson = (iAddNames >= 0 || iAddPrices >= 0)
            ? parseAddons(row[iAddNames] || '', row[iAddPrices] || '')
            : '[]';

          const existing = selectExisting.get(RESTAURANT_ID, name, category);
          if (existing && existing.id) {
            if (!doUpsert) { skipped++; continue; }
            updateItem.run(category || null, description || null, price, isVeg, addonsJson, existing.id, RESTAURANT_ID);
            updated++;
          } else {
            insertItem.run(
              RESTAURANT_ID,
              name,
              category || null,
              description || null,
              price,
              null,          // image_url
              isVeg,
              1,             // is_available
              0,             // is_bestseller
              0,             // is_spicy
              0,             // is_fan_favourite
              addonsJson,
              '{}',          // metadata_json
              0              // sort_order
            );
            added++;
          }
        } catch (e) {
          failed++;
        }
      }
    });
    tx();

    res.json({ success: true, added, updated, skipped, failed });
  } catch (e) {
    console.error('[menu/import-csv]', e);
    res.status(500).json({ error: 'Failed to import CSV.' });
  }
});

// PUT /api/restaurant/menu/:id — update item
router.put('/menu/:id', requireRestaurant, ...upload.single('image'), (req, res) => {
  const existing = db.prepare(
    'SELECT * FROM menu_items WHERE id=? AND restaurant_id=?'
  ).get(req.params.id, RESTAURANT_ID);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const {
    name, category, description, price,
    is_veg, is_available, is_bestseller, is_spicy, is_fan_favourite, addons, metadata, sort_order
  } = req.body;
  const image_url = req.file
    ? (req.file.publicUrl || `/images/menu/${req.file.filename}`)
    : (req.body.image_url !== undefined ? req.body.image_url : existing.image_url);
  db.prepare(`
    UPDATE menu_items SET
      name=?, category=?, description=?, price=?, image_url=?,
      is_veg=?, is_available=?, is_bestseller=?, is_spicy=?, is_fan_favourite=?,
      addons_json=?, metadata_json=?, sort_order=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND restaurant_id=?`).run(
    nullish(name, existing.name),
    nullish(category, existing.category),
    nullish(description, existing.description),
    price       !== undefined ? parseFloat(price) : existing.price,
    image_url,
    is_veg           !== undefined ? Number(is_veg)           : existing.is_veg,
    is_available     !== undefined ? Number(is_available)     : existing.is_available,
    is_bestseller    !== undefined ? Number(is_bestseller)    : existing.is_bestseller,
    is_spicy         !== undefined ? Number(is_spicy)         : existing.is_spicy,
    is_fan_favourite !== undefined ? Number(is_fan_favourite) : (existing.is_fan_favourite || 0),
    nullish(addons, existing.addons_json),
    nullish(metadata, existing.metadata_json),
    sort_order !== undefined ? Number(sort_order) : existing.sort_order,
    req.params.id, RESTAURANT_ID
  );
  res.json({ success: true });
});

// DELETE /api/restaurant/menu/:id
router.delete('/menu/:id', requireRestaurant, (req, res) => {
  const info = db.prepare(
    'DELETE FROM menu_items WHERE id=? AND restaurant_id=?'
  ).run(req.params.id, RESTAURANT_ID);
  if (!info.changes) return res.status(404).json({ error: 'Item not found' });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OFFERS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/restaurant/offers — all offers for this restaurant
router.get('/offers', requireRestaurant, (req, res) => {
  const offers = db.prepare(
    'SELECT * FROM offers WHERE restaurant_id=? ORDER BY created_at DESC'
  ).all(RESTAURANT_ID);
  res.json({ offers });
});

// POST /api/restaurant/offers
router.post('/offers', requireRestaurant, ...uploadOffer.single('image'), (req, res) => {
  const { code, title, description, discount_type, discount_value,
          min_order, max_discount, is_active, valid_from, valid_until, usage_limit,
          badge, emoji, old_price } = req.body;
  if (!code || !title || discount_value === undefined)
    return res.status(400).json({ error: 'code, title and discount_value required' });
  const dup = db.prepare('SELECT id FROM offers WHERE restaurant_id=? AND code=?')
                .get(RESTAURANT_ID, code.toUpperCase());
  if (dup) return res.status(409).json({ error: 'Offer code already exists' });
  const image_url = req.file ? (req.file.publicUrl || `/images/offers/${req.file.filename}`) : null;
  const info = db.prepare(`
    INSERT INTO offers
      (restaurant_id, code, title, description, discount_type, discount_value,
       min_order, max_discount, is_active, valid_from, valid_until, usage_limit,
       badge, emoji, old_price, image_url)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    RESTAURANT_ID, code.toUpperCase(), title, description,
    discount_type || 'percent', parseFloat(discount_value),
    parseFloat(min_order || 0), max_discount ? parseFloat(max_discount) : null,
    is_active !== undefined ? Number(is_active) : 1,
    valid_from || null, valid_until || null,
    usage_limit ? parseInt(usage_limit) : null,
    badge || null, emoji || null,
    old_price ? parseFloat(old_price) : null, image_url
  );
  res.json({ success: true, id: info.lastInsertRowid });
});

// PUT /api/restaurant/offers/:id
router.put('/offers/:id', requireRestaurant, ...uploadOffer.single('image'), (req, res) => {
  const existing = db.prepare(
    'SELECT * FROM offers WHERE id=? AND restaurant_id=?'
  ).get(req.params.id, RESTAURANT_ID);
  if (!existing) return res.status(404).json({ error: 'Offer not found' });
  const { code, title, description, discount_type, discount_value,
          min_order, max_discount, is_active, valid_from, valid_until, usage_limit,
          badge, emoji, old_price } = req.body;
  const image_url = req.file
    ? (req.file.publicUrl || `/images/offers/${req.file.filename}`)
    : (req.body.image_url !== undefined ? (req.body.image_url || null) : existing.image_url);
  db.prepare(`
    UPDATE offers SET code=?,title=?,description=?,discount_type=?,discount_value=?,
      min_order=?,max_discount=?,is_active=?,valid_from=?,valid_until=?,usage_limit=?,
      badge=?,emoji=?,old_price=?,image_url=?
    WHERE id=? AND restaurant_id=?`).run(
    (code || existing.code).toUpperCase(),
    nullish(title, existing.title),
    nullish(description, existing.description),
    nullish(discount_type, existing.discount_type),
    discount_value !== undefined ? parseFloat(discount_value) : existing.discount_value,
    min_order    !== undefined ? parseFloat(min_order)    : existing.min_order,
    max_discount !== undefined ? parseFloat(max_discount) : existing.max_discount,
    is_active    !== undefined ? Number(is_active)        : existing.is_active,
    nullish(valid_from || null, existing.valid_from),
    nullish(valid_until || null, existing.valid_until),
    usage_limit !== undefined ? parseInt(usage_limit) : existing.usage_limit,
    badge     !== undefined ? (badge     || null) : existing.badge,
    emoji     !== undefined ? (emoji     || null) : existing.emoji,
    old_price !== undefined ? (old_price ? parseFloat(old_price) : null) : existing.old_price,
    image_url,
    req.params.id, RESTAURANT_ID
  );
  res.json({ success: true });
});

// DELETE /api/restaurant/offers/:id
router.delete('/offers/:id', requireRestaurant, (req, res) => {
  const info = db.prepare(
    'DELETE FROM offers WHERE id=? AND restaurant_id=?'
  ).run(req.params.id, RESTAURANT_ID);
  if (!info.changes) return res.status(404).json({ error: 'Offer not found' });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESTAURANT CONFIG (RTSP URL, etc.)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/restaurant/location — get current restaurant GPS + delivery radius
router.get('/location', requireRestaurant, (req, res) => {
  const r = db.prepare(`SELECT lat, lng, max_delivery_km FROM restaurants WHERE id=1`).get() || {};
  res.json({
    lat: r.lat == null ? null : r.lat,
    lng: r.lng == null ? null : r.lng,
    max_delivery_km: r.max_delivery_km == null ? 50 : r.max_delivery_km,
  });
});

// PUT /api/restaurant/location — update restaurant GPS + delivery radius
router.put('/location', requireRestaurant, (req, res) => {
  const { lat, lng, max_delivery_km } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  db.prepare(`UPDATE restaurants SET lat=?, lng=?, max_delivery_km=? WHERE id=1`)
    .run(parseFloat(lat), parseFloat(lng), parseFloat(max_delivery_km) || 50);
  res.json({ success: true });
});

// GET /api/restaurant/settings — all editable restaurant settings
router.get('/settings', requireRestaurant, (req, res) => {
  const r = db.prepare(`
    SELECT name, address, phone, description, tagline, cuisine_type,
           opening_time, closing_time, is_accepting_orders,
           delivery_fee, min_order_amount, prep_time_minutes,
           tax_percent, packaging_charge, fssai_number, gstin,
           lat, lng, max_delivery_km
    FROM restaurants WHERE id=1
  `).get();
  res.json(r || {});
});

// PUT /api/restaurant/settings — save all editable restaurant settings
router.put('/settings', requireRestaurant, (req, res) => {
  const allowed = [
    'name', 'address', 'phone', 'description', 'tagline', 'cuisine_type',
    'opening_time', 'closing_time', 'is_accepting_orders',
    'delivery_fee', 'min_order_amount', 'prep_time_minutes',
    'tax_percent', 'packaging_charge', 'fssai_number', 'gstin',
    'lat', 'lng', 'max_delivery_km',
  ];
  const fields = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!fields.length) return res.status(400).json({ error: 'No valid fields provided' });
  const set    = fields.map(f => `${f}=?`).join(', ');
  const values = fields.map(f => {
    const v = req.body[f];
    // Coerce numeric fields
    if (['delivery_fee','min_order_amount','tax_percent','packaging_charge','lat','lng','max_delivery_km'].includes(f))
      return parseFloat(v) || 0;
    if (['prep_time_minutes','is_accepting_orders'].includes(f)) {
      const n = parseInt(v, 10);
      return Number.isNaN(n) ? 0 : n;
    }
    return v;
  });
  db.prepare(`UPDATE restaurants SET ${set} WHERE id=1`).run(...values);
  res.json({ success: true });
});

// GET /api/restaurant/config/:key
router.get('/config/:key', requireRestaurant, (req, res) => {
  const row = db.prepare('SELECT value FROM restaurant_config WHERE key=?').get(req.params.key);
  res.json({ key: req.params.key, value: row ? row.value : null });
});

function writeRestaurantConfig(req, res) {
  let { value } = req.body || {};
  if (value === undefined || value === null) value = '';
  else if (typeof value !== 'string') value = JSON.stringify(value);
  db.prepare(`INSERT INTO restaurant_config (key,value) VALUES (?,?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`)
    .run(req.params.key, value);
  res.json({ success: true });
}

// PUT /api/restaurant/config/:key (some proxies block PUT — keep POST duplicate below)
router.put('/config/:key', requireRestaurant, writeRestaurantConfig);
// POST /api/restaurant/config/:key — same as PUT for compatibility with restrictive nginx/CDN setups
router.post('/config/:key', requireRestaurant, writeRestaurantConfig);

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE STREAMING
// ═══════════════════════════════════════════════════════════════════════════════

function isProbablyHlsPlaylistResponse(contentType) {
  return /application\/vnd\.apple\.mpegurl|application\/x-mpegurl|audio\/mpegurl|audio\/x-mpegurl/i.test(String(contentType || ''));
}

function isProbablyMpegTsOrCmaf(contentType) {
  return /video\/mp2t|application\/octet-stream|video\/mp4|application\/mp4/i.test(String(contentType || ''));
}

function absolutizeUrl(base, ref) {
  try {
    return new URL(ref, base).toString();
  } catch {
    return ref;
  }
}

function rewritePlaylistToProxy({ playlistText, playlistUrl, proxyBaseUrl }) {
  // Rewrites:
  // - Any non-comment URI line
  // - Any URI="..." attribute inside EXT-X-* tags (e.g. EXT-X-MAP, EXT-X-PART, EXT-X-KEY)
  // so all follow-up requests stay same-origin (no CORS issues).
  return String(playlistText || '')
    .split('\n')
    .map((line) => {
      const rawLine = String(line || '');
      const l = rawLine.trim();
      if (!l) return rawLine;

      // Rewrite tag attributes: URI="..."
      if (l.startsWith('#')) {
        return rawLine.replace(/URI="([^"]+)"/g, (_, uri) => {
          const abs = absolutizeUrl(playlistUrl, uri);
          return `URI="${proxyBaseUrl}?u=${encodeURIComponent(abs)}"`;
        });
      }

      // Rewrite standalone URI line
      const abs = absolutizeUrl(playlistUrl, l);
      return `${proxyBaseUrl}?u=${encodeURIComponent(abs)}`;
    })
    .join('\n');
}

async function proxyRemoteHls(req, res, { configuredHlsUrl }) {
  const token = req.params.token;
  const v     = liveAccess.validatePlayback(db, token);
  if (!v.ok) {
    return res.status(403).type('text/plain').send('Forbidden');
  }

  const raw = String(configuredHlsUrl || '').trim();
  if (!raw) return res.status(503).type('text/plain').send('HLS URL not configured');

  // SSRF guard: only allow fetching from the same origin as the configured URL.
  let allowedOrigin = '';
  try { allowedOrigin = new URL(raw).origin; } catch {}
  if (!allowedOrigin) return res.status(400).type('text/plain').send('Invalid HLS URL');

  const target = String(req.query.u || '').trim() || raw;
  let targetUrl;
  try { targetUrl = new URL(target); } catch { return res.status(400).type('text/plain').send('Invalid URL'); }
  if (targetUrl.origin !== allowedOrigin) {
    return res.status(403).type('text/plain').send('Blocked origin');
  }

  // Fetch remote (follow redirects) and stream back.
  let resp;
  try {
    resp = await fetch(targetUrl.toString(), { redirect: 'follow' });
  } catch (e) {
    return res.status(502).type('text/plain').send(e.message || 'Upstream fetch failed');
  }

  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    return res.status(resp.status).type('text/plain').send(t || `Upstream error (${resp.status})`);
  }

  const contentType = resp.headers.get('content-type') || '';
  const cacheControl = resp.headers.get('cache-control') || 'no-store';
  res.set('Cache-Control', cacheControl);

  // If playlist: rewrite URIs to go back through this proxy.
  if (isProbablyHlsPlaylistResponse(contentType) || targetUrl.pathname.endsWith('.m3u8')) {
    const txt = await resp.text();
    const proxyBaseUrl = `/api/restaurant/stream/cdn/${encodeURIComponent(token)}`;
    const rewritten = rewritePlaylistToProxy({
      playlistText: txt,
      playlistUrl: targetUrl.toString(),
      proxyBaseUrl,
    });
    res.type('application/vnd.apple.mpegurl');
    return res.send(rewritten);
  }

  // Otherwise: pass through binary (segments)
  if (isProbablyMpegTsOrCmaf(contentType)) res.type(contentType);
  else res.type('application/octet-stream');
  const buf = Buffer.from(await resp.arrayBuffer());
  return res.send(buf);
}

function tryStopTranscoderIfIdle() {
  db.prepare(`DELETE FROM live_public_sessions WHERE expires_at < datetime('now')`).run();
  const liveN = db.prepare(`SELECT COUNT(*) AS n FROM live_streams WHERE status='active'`).get().n;
  const pubN  = db.prepare(
    `SELECT COUNT(*) AS n FROM live_public_sessions WHERE expires_at >= datetime('now')`
  ).get().n;
  const prevN = liveAccess.activePreviewCount();
  if (liveN === 0 && pubN === 0 && prevN === 0) hls.stop();
}

function serveHlsFile(req, res, filename) {
  const token = req.params.token;
  const v     = liveAccess.validatePlayback(db, token);
  if (!v.ok) {
    return res.status(403).type('text/plain').send('Forbidden');
  }
  const rtsp = liveAccess.getRtspUrl(db);
  try {
    hls.ensureRunning(rtsp);
  } catch (e) {
    return res.status(503).type('text/plain').send(e.message || 'Stream unavailable');
  }
  const dir  = hls.getOutputDir();
  const safe = path.basename(filename);
  if (safe !== 'index.m3u8' && !/^seg_\d+\.ts$/.test(safe)) {
    return res.status(400).end();
  }
  const filePath = path.join(dir, safe);
  if (!fs.existsSync(filePath)) {
    return res.status(503).type('text/plain').send('Playlist not ready — try again in a few seconds');
  }
  if (safe.endsWith('.m3u8')) res.type('application/vnd.apple.mpegurl');
  else res.type('video/mp2t');
  res.sendFile(filePath);
}

// GET /api/restaurant/stream/hls/:token/index.m3u8
router.get('/stream/hls/:token/index.m3u8', (req, res) => {
  serveHlsFile(req, res, 'index.m3u8');
});

// GET /api/restaurant/stream/hls/:token/:segment
router.get('/stream/hls/:token/:segment', (req, res) => {
  serveHlsFile(req, res, req.params.segment);
});

// GET /api/restaurant/stream/cdn/:token  (proxy for configured CDN HLS)
router.get('/stream/cdn/:token', async (req, res) => {
  const configuredHlsUrl = (liveAccess.getHlsUrl(db) || '').trim();
  return proxyRemoteHls(req, res, { configuredHlsUrl });
});

/**
 * GET /api/restaurant/stream/webrtc/:token
 * Same-origin HTML shell that embeds the configured WebRTC viewer URL.
 * Validates the stream token on every request (unlike exposing a static embed URL in JSON).
 * Viewer URL stays server-side; GET /stream/token/:token exposes only playback mode + iframe path.
 */
router.get('/stream/webrtc/:token', (req, res) => {
  const token = req.params.token;
  const v = liveAccess.validatePlayback(db, token);
  if (!v.ok) {
    res.set('Cache-Control', 'no-store');
    return res.status(403).type('html').send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Stream</title></head>
<body style="margin:0;background:#1a0a00;color:#ccc;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;">Access denied or stream ended.</body></html>`);
  }
  const raw = (liveAccess.getWebrtcUrl(db) || '').trim();
  if (!raw) {
    res.set('Cache-Control', 'no-store');
    return res.status(503).type('html').send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Stream</title></head>
<body style="margin:0;background:#1a0a00;color:#ccc;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;">Live viewer is not configured.</body></html>`);
  }
  const src = escapeHtmlAttr(raw);
  res.set('Cache-Control', 'no-store');
  res.type('html').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Live stream</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}iframe{border:0;width:100%;height:100%;display:block}</style>
</head><body>
<iframe src="${src}" title="Live kitchen stream" allow="autoplay; fullscreen; picture-in-picture; encrypted-media; camera; microphone" allowfullscreen referrerpolicy="no-referrer"></iframe>
</body></html>`);
});

// POST /api/restaurant/stream/preview/start — restaurant-only preview token + HLS
router.post('/stream/preview/start', requireRestaurant, (req, res) => {
  const rtsp = liveAccess.getRtspUrl(db);
  try {
    hls.ensureRunning(rtsp);
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Could not start transcoder' });
  }
  const token = liveAccess.issuePreviewToken();
  res.json({
    success: true,
    token,
    hlsUrl: `/api/restaurant/stream/hls/${token}/index.m3u8`,
  });
});

// POST /api/restaurant/stream/preview/stop
router.post('/stream/preview/stop', requireRestaurant, (req, res) => {
  const { token } = req.body || {};
  if (token) liveAccess.revokePreviewToken(token);
  tryStopTranscoderIfIdle();
  res.json({ success: true });
});

// POST /api/restaurant/stream/start/:orderId — start stream for an order
router.post('/stream/start/:orderId', requireRestaurant, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['accepted', 'preparing'].includes(order.status))
    return res.status(400).json({ error: 'Order must be accepted/preparing to stream' });

  // Stop any existing active stream for this order
  db.prepare(`UPDATE live_streams SET status='stopped', stopped_at=CURRENT_TIMESTAMP
              WHERE order_id=? AND status='active'`).run(req.params.orderId);

  // Create new stream token
  const token = uuidv4();
  const info  = db.prepare(`
    INSERT INTO live_streams (order_id, user_id, token, status)
    VALUES (?, ?, ?, 'active')`).run(req.params.orderId, order.user_id, token);

  // Notify the customer via WebSocket
  if (global.notifyUser) global.notifyUser(order.user_id, {
    type: 'stream_started',
    orderId: order.id,
    streamToken: token,
    streamUrl: `/stream?token=${token}`
  });

  res.json({ success: true, streamId: info.lastInsertRowid, token, streamUrl: `/stream?token=${token}` });
});

// POST /api/restaurant/stream/stop/:orderId — stop stream
router.post('/stream/stop/:orderId', requireRestaurant, (req, res) => {
  const stream = db.prepare(`SELECT * FROM live_streams WHERE order_id=? AND status='active'`)
    .get(req.params.orderId);
  if (!stream) return res.status(404).json({ error: 'No active stream for this order' });

  db.prepare(`UPDATE live_streams SET status='stopped', stopped_at=CURRENT_TIMESTAMP
              WHERE id=?`).run(stream.id);

  // Notify customer that stream ended
  if (global.notifyUser) global.notifyUser(stream.user_id, {
    type: 'stream_stopped',
    orderId: req.params.orderId
  });

  tryStopTranscoderIfIdle();
  res.json({ success: true });
});

// GET /api/restaurant/stream/token/:token — validate stream token (customer side)
router.get('/stream/token/:token', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const token = req.params.token;
  const v     = liveAccess.validatePlayback(db, token);

  if (!v.ok) {
    if (v.reason === 'disabled') {
      return res.json({
        valid: false,
        reason: 'disabled',
        error: 'Live stream is currently disabled.',
      });
    }
    if (v.reason === 'not_allowed') {
      return res.json({
        valid: false,
        reason: 'not_allowed',
        error: 'This order is no longer authorized for live view.',
      });
    }
    return res.status(404).json({ error: 'Stream not found or already stopped' });
  }

  const orderLabel = v.orderId != null ? formatOrderCustomerLabel(v.orderId) : '—';
  const webrtcViewer = (liveAccess.getWebrtcUrl(db) || '').trim();
  if (webrtcViewer) {
    return res.json({
      valid: true,
      orderId: v.orderId,
      orderLabel,
      playback: 'webrtc',
      webrtcEmbedSrc: `/api/restaurant/stream/webrtc/${encodeURIComponent(token)}`,
    });
  }
  const configuredHlsUrl = (liveAccess.getHlsUrl(db) || '').trim();
  const fallbackHlsUrl = `/api/restaurant/stream/hls/${token}/index.m3u8`;
  const hlsUrl = configuredHlsUrl
    ? `/api/restaurant/stream/cdn/${encodeURIComponent(token)}`
    : fallbackHlsUrl;
  res.json({
    valid: true,
    orderId: v.orderId,
    orderLabel,
    playback: 'hls',
    hlsUrl,
  });
});

// GET /api/restaurant/stream/active — list all active streams (restaurant view)
router.get('/stream/active', requireRestaurant, (req, res) => {
  const streams = db.prepare(`
    SELECT ls.*, o.items_json, u.name as user_name, u.phone as user_phone
    FROM live_streams ls
    JOIN orders o ON o.id = ls.order_id
    JOIN users  u ON u.id = ls.user_id
    WHERE ls.status='active'
    ORDER BY ls.started_at DESC`).all();
  res.json({ streams });
});

module.exports = router;