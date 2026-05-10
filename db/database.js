/**
 * Open Kitchens — SQLite Database
 * Initialises the database file and creates all tables on first run.
 */
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DB_DIR  = path.join(__dirname, '..', 'db', 'data');
const DB_FILE = path.join(DB_DIR, 'openkitchens.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_FILE);

// Performance tuning
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  -- Restaurants
  CREATE TABLE IF NOT EXISTS restaurants (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL DEFAULT 'Open Kitchens',
    slug       TEXT UNIQUE NOT NULL DEFAULT 'open-kitchens',
    address    TEXT,
    phone      TEXT,
    is_active  INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Users
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT,
    email        TEXT UNIQUE,
    phone        TEXT UNIQUE,
    password_hash TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- OTP store (phone-based login)
  CREATE TABLE IF NOT EXISTS otp_store (
    phone      TEXT PRIMARY KEY,
    otp        TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  -- Delivery addresses (per user)
  CREATE TABLE IF NOT EXISTS addresses (
    id           TEXT PRIMARY KEY,
    user_id      INTEGER NOT NULL,
    label        TEXT,
    short_name   TEXT,
    full_address TEXT,
    lat          REAL,
    lng          REAL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Cart items (persisted per user)
  CREATE TABLE IF NOT EXISTS cart_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    restaurant_id   INTEGER NOT NULL DEFAULT 1,
    item_id         INTEGER NOT NULL,
    name            TEXT,
    price           REAL,
    quantity        INTEGER DEFAULT 1,
    category        TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)       REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
  );

  -- Orders
  CREATE TABLE IF NOT EXISTS orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    restaurant_id   INTEGER NOT NULL DEFAULT 1,
    address_id      TEXT,
    items_json      TEXT NOT NULL,
    subtotal        REAL,
    delivery_fee    REAL DEFAULT 0,
    total           REAL,
    status          TEXT DEFAULT 'placed',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)       REFERENCES users(id),
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
  );

  -- Menu items (restaurant-managed)
  CREATE TABLE IF NOT EXISTS menu_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL DEFAULT 1,
    name          TEXT NOT NULL,
    category      TEXT,
    description   TEXT,
    price         REAL NOT NULL,
    image_url     TEXT,
    is_veg        INTEGER DEFAULT 1,
    is_available  INTEGER DEFAULT 1,
    is_bestseller INTEGER DEFAULT 0,
    is_spicy      INTEGER DEFAULT 0,
    addons_json   TEXT DEFAULT '[]',
    metadata_json TEXT DEFAULT '{}',
    sort_order    INTEGER DEFAULT 0,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
  );

  -- Offers
  CREATE TABLE IF NOT EXISTS offers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id   INTEGER NOT NULL DEFAULT 1,
    code            TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    discount_type   TEXT DEFAULT 'percent',
    discount_value  REAL NOT NULL,
    min_order       REAL DEFAULT 0,
    max_discount    REAL,
    is_active       INTEGER DEFAULT 1,
    valid_from      DATETIME,
    valid_until     DATETIME,
    usage_limit     INTEGER,
    usage_count     INTEGER DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
  );

  -- Restaurant configuration (RTSP URL, settings, etc.)
  CREATE TABLE IF NOT EXISTS restaurant_config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Live streams (per order, token-based access for customer)
  CREATE TABLE IF NOT EXISTS live_streams (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    token      TEXT UNIQUE NOT NULL,
    status     TEXT DEFAULT 'active',
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    stopped_at DATETIME,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (user_id)  REFERENCES users(id)
  );

  -- Public live access (order ID gate, no user FK)
  CREATE TABLE IF NOT EXISTS live_public_sessions (
    token      TEXT PRIMARY KEY,
    order_id   INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Stream feedback (customer ratings captured on stream page)
  -- One row per public session token (overwrite on resubmit).
  CREATE TABLE IF NOT EXISTS stream_feedback (
    token        TEXT PRIMARY KEY,
    order_id     INTEGER NOT NULL,
    live_idea    INTEGER,
    trust        INTEGER,
    order_again  INTEGER,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_stream_feedback_order_id ON stream_feedback(order_id);
`);

// ── Migrations: add restaurant_id to existing tables if missing ───────────────
const existingCols = name => db.prepare(`PRAGMA table_info(${name})`).all().map(c => c.name);

if (!existingCols('menu_items').includes('restaurant_id')) {
  db.exec(`ALTER TABLE menu_items ADD COLUMN restaurant_id INTEGER NOT NULL DEFAULT 1`);
}
if (!existingCols('offers').includes('restaurant_id')) {
  db.exec(`ALTER TABLE offers ADD COLUMN restaurant_id INTEGER NOT NULL DEFAULT 1`);
}
if (!existingCols('offers').includes('badge'))     db.exec(`ALTER TABLE offers ADD COLUMN badge TEXT DEFAULT NULL`);
if (!existingCols('offers').includes('emoji'))     db.exec(`ALTER TABLE offers ADD COLUMN emoji TEXT DEFAULT NULL`);
if (!existingCols('offers').includes('old_price')) db.exec(`ALTER TABLE offers ADD COLUMN old_price REAL DEFAULT NULL`);
if (!existingCols('cart_items').includes('restaurant_id')) {
  db.exec(`ALTER TABLE cart_items ADD COLUMN restaurant_id INTEGER NOT NULL DEFAULT 1`);
}
if (!existingCols('orders').includes('restaurant_id')) {
  db.exec(`ALTER TABLE orders ADD COLUMN restaurant_id INTEGER NOT NULL DEFAULT 1`);
}
if (!existingCols('menu_items').includes('is_fan_favourite')) {
  db.exec(`ALTER TABLE menu_items ADD COLUMN is_fan_favourite INTEGER NOT NULL DEFAULT 0`);
}
if (!existingCols('offers').includes('image_url')) {
  db.exec(`ALTER TABLE offers ADD COLUMN image_url TEXT DEFAULT NULL`);
}
// Add lat/lng to restaurants for distance-based delivery time
if (!existingCols('restaurants').includes('lat')) {
  db.exec(`ALTER TABLE restaurants ADD COLUMN lat  REAL DEFAULT NULL`);
  db.exec(`ALTER TABLE restaurants ADD COLUMN lng  REAL DEFAULT NULL`);
  db.exec(`ALTER TABLE restaurants ADD COLUMN max_delivery_km REAL DEFAULT 50`);
  db.prepare(`UPDATE restaurants SET lat=12.9279, lng=77.6271, max_delivery_km=50 WHERE id=1`).run();
}
// General restaurant settings columns
const rCols = existingCols('restaurants');
if (!rCols.includes('description'))        db.exec(`ALTER TABLE restaurants ADD COLUMN description        TEXT    DEFAULT NULL`);
if (!rCols.includes('tagline'))            db.exec(`ALTER TABLE restaurants ADD COLUMN tagline            TEXT    DEFAULT NULL`);
if (!rCols.includes('logo_url'))           db.exec(`ALTER TABLE restaurants ADD COLUMN logo_url           TEXT    DEFAULT NULL`);
if (!rCols.includes('cover_url'))          db.exec(`ALTER TABLE restaurants ADD COLUMN cover_url          TEXT    DEFAULT NULL`);
if (!rCols.includes('opening_time'))       db.exec(`ALTER TABLE restaurants ADD COLUMN opening_time       TEXT    DEFAULT '09:00'`);
if (!rCols.includes('closing_time'))       db.exec(`ALTER TABLE restaurants ADD COLUMN closing_time       TEXT    DEFAULT '22:00'`);
if (!rCols.includes('is_accepting_orders'))db.exec(`ALTER TABLE restaurants ADD COLUMN is_accepting_orders INTEGER DEFAULT 1`);
if (!rCols.includes('delivery_fee'))       db.exec(`ALTER TABLE restaurants ADD COLUMN delivery_fee       REAL    DEFAULT 0`);
if (!rCols.includes('min_order_amount'))   db.exec(`ALTER TABLE restaurants ADD COLUMN min_order_amount   REAL    DEFAULT 0`);
if (!rCols.includes('prep_time_minutes'))  db.exec(`ALTER TABLE restaurants ADD COLUMN prep_time_minutes  INTEGER DEFAULT 20`);
if (!rCols.includes('tax_percent'))        db.exec(`ALTER TABLE restaurants ADD COLUMN tax_percent         REAL    DEFAULT 5`);
if (!rCols.includes('packaging_charge'))   db.exec(`ALTER TABLE restaurants ADD COLUMN packaging_charge    REAL    DEFAULT 20`);
if (!rCols.includes('cuisine_type'))       db.exec(`ALTER TABLE restaurants ADD COLUMN cuisine_type        TEXT    DEFAULT NULL`);
if (!rCols.includes('fssai_number'))       db.exec(`ALTER TABLE restaurants ADD COLUMN fssai_number        TEXT    DEFAULT NULL`);
if (!rCols.includes('gstin'))              db.exec(`ALTER TABLE restaurants ADD COLUMN gstin               TEXT    DEFAULT NULL`);

// Drop unique constraint on offers.code if it was a standalone UNIQUE (can't alter, recreate not needed — just enforce at app level)

// ── Seed default restaurant (id=1) ────────────────────────────────────────────
const hasRestaurant = db.prepare(`SELECT id FROM restaurants WHERE id=1`).get();
if (!hasRestaurant) {
  db.prepare(`INSERT INTO restaurants (id, name, slug, address) VALUES (1, 'Open Kitchens', 'open-kitchens', 'Bengaluru, Karnataka')`).run();
}

// ── Indexes ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_restaurant    ON orders(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_menu_restaurant      ON menu_items(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_offers_restaurant    ON offers(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_cart_user_restaurant ON cart_items(user_id, restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_live_public_expires ON live_public_sessions(expires_at);
`);

console.log(`[DB] SQLite ready → ${DB_FILE}`);

module.exports = db;