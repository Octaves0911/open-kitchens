/**
 * Auth Routes — /api/auth/*
 *
 * POST /api/auth/register     – email + password sign-up
 * POST /api/auth/login        – email + password login
 * POST /api/auth/send-otp     – send (simulate) OTP to phone
 * POST /api/auth/verify-otp   – verify OTP, return token
 * GET  /api/auth/me           – get current user (requireAuth)
 * POST /api/auth/logout       – client-side token removal (no-op server side)
 */
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const db      = require('../db/database');
const { requireAuth, signToken } = require('../middleware/auth');

// ── Helpers ──────────────────────────────────────────────────────────────────
function safeUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

// ── Register (email + password) ───────────────────────────────────────────────
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 6)  return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Email already registered. Please log in.' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'
  ).run(name || null, email.toLowerCase(), hash);

  const user  = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = signToken({ id: user.id, email: user.email });

  res.status(201).json({ token, user: safeUser(user) });
});

// ── Login (email + password) ──────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user)                            return res.status(401).json({ error: 'No account found with that email' });
  if (!bcrypt.compareSync(password, user.password_hash))
                                        return res.status(401).json({ error: 'Incorrect password' });

  const token = signToken({ id: user.id, email: user.email });
  res.json({ token, user: safeUser(user) });
});

// ── Send OTP (phone) ──────────────────────────────────────────────────────────
router.post('/send-otp', (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'Valid 10-digit phone required' });

  // Generate 6-digit OTP (in production this would go via SMS gateway)
  const otp     = String(Math.floor(100000 + Math.random() * 900000));
  const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

  db.prepare('INSERT OR REPLACE INTO otp_store (phone, otp, expires_at) VALUES (?, ?, ?)')
    .run(phone, otp, expires);

  // In dev mode — return OTP in response so you can test without an SMS service
  console.log(`[OTP] Phone: +91${phone}  OTP: ${otp}`);
  res.json({
    message: 'OTP sent',
    ...(process.env.NODE_ENV !== 'production' && { dev_otp: otp })
  });
});

// ── Verify OTP ────────────────────────────────────────────────────────────────
router.post('/verify-otp', (req, res) => {
  const { phone, otp, name } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP required' });

  const record = db.prepare('SELECT * FROM otp_store WHERE phone = ?').get(phone);
  if (!record)              return res.status(400).json({ error: 'OTP not found. Please request a new one.' });
  if (Date.now() > record.expires_at) {
    db.prepare('DELETE FROM otp_store WHERE phone = ?').run(phone);
    return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
  }
  if (record.otp !== String(otp)) return res.status(400).json({ error: 'Incorrect OTP' });

  // OTP valid — clean up
  db.prepare('DELETE FROM otp_store WHERE phone = ?').run(phone);

  // Find or create user by phone
  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) {
    const result = db.prepare('INSERT INTO users (name, phone) VALUES (?, ?)').run(name || null, phone);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  }

  const token = signToken({ id: user.id, phone: user.phone });
  res.json({ token, user: safeUser(user) });
});

// ── Me ────────────────────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: safeUser(user) });
});

// ── Update profile ────────────────────────────────────────────────────────────
router.patch('/me', requireAuth, (req, res) => {
  const { name } = req.body;
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name || null, req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: safeUser(user) });
});

// ── Logout (stateless — client drops the token) ───────────────────────────────
router.post('/logout', (req, res) => res.json({ message: 'Logged out' }));

module.exports = router;
