/**
 * Address Routes — /api/addresses/*  (requires auth)
 *
 * GET    /api/addresses          – list all saved addresses
 * POST   /api/addresses          – save a new address
 * DELETE /api/addresses/:id      – delete an address
 * POST   /api/addresses/sync     – bulk-sync from localStorage on login
 */
const router = require('express').Router();
const db     = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// All routes require auth
router.use(requireAuth);

// ── List ──────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const addresses = db.prepare(
    'SELECT * FROM addresses WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.id);
  res.json({ addresses });
});

// ── Save ──────────────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { id, label, short_name, full_address, lat, lng } = req.body;
  if (!short_name) return res.status(400).json({ error: 'short_name is required' });

  const addrId = id || 'addr_' + Date.now();

  db.prepare(`
    INSERT OR REPLACE INTO addresses (id, user_id, label, short_name, full_address, lat, lng)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(addrId, req.user.id, label || null, short_name, full_address || null, lat || null, lng || null);

  const saved = db.prepare('SELECT * FROM addresses WHERE id = ?').get(addrId);
  res.status(201).json({ address: saved });
});

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const result = db.prepare(
    'DELETE FROM addresses WHERE id = ? AND user_id = ?'
  ).run(req.params.id, req.user.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Address not found' });
  res.json({ message: 'Deleted' });
});

// ── Bulk sync from localStorage ───────────────────────────────────────────────
router.post('/sync', (req, res) => {
  const { addresses } = req.body;
  if (!Array.isArray(addresses)) return res.status(400).json({ error: 'addresses array required' });

  const insert = db.prepare(`
    INSERT OR IGNORE INTO addresses (id, user_id, label, short_name, full_address, lat, lng)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const syncMany = db.transaction((list) => {
    for (const a of list) {
      if (a.shortName || a.short_name) {
        insert.run(
          a.id || ('addr_' + Date.now() + Math.random()),
          req.user.id,
          a.label || null,
          a.shortName || a.short_name,
          a.fullAddress || a.full_address || null,
          a.lat || null,
          a.lng || null
        );
      }
    }
  });

  syncMany(addresses);

  const all = db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ addresses: all });
});

module.exports = router;
