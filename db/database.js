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
    expires_at INTEGER NOT NULL   -- unix timestamp ms
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
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    item_id      TEXT NOT NULL,
    name         TEXT,
    price        REAL,
    quantity     INTEGER DEFAULT 1,
    category     TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Orders
  CREATE TABLE IF NOT EXISTS orders (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    address_id   TEXT,
    items_json   TEXT NOT NULL,
    subtotal     REAL,
    delivery_fee REAL DEFAULT 0,
    total        REAL,
    status       TEXT DEFAULT 'placed',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

console.log(`[DB] SQLite ready → ${DB_FILE}`);

module.exports = db;
