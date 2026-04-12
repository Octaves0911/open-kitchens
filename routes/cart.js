/**
 * Cart Routes — /api/cart/*  (requires auth)
 *
 * GET    /api/cart              – get all items in cart
 * POST   /api/cart              – add / increment item
 * PUT    /api/cart/:id          – set quantity explicitly
 * DELETE /api/cart/:id          – remove item
 * DELETE /api/cart              – clear entire cart
 */
const router = require('express').Router();
const db     = require('../db/database');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ── Get cart ──────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const items = db.prepare(
    'SELECT * FROM cart_items WHERE user_id = ? ORDER BY created_at ASC'
  ).all(req.user.id);
  res.json({ items });
});

// ── Add / increment item ──────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { item_id, name, price, category } = req.body;
  if (!item_id) return res.status(400).json({ error: 'item_id required' });

  const existing = db.prepare(
    'SELECT * FROM cart_items WHERE user_id = ? AND item_id = ?'
  ).get(req.user.id, item_id);

  if (existing) {
    db.prepare('UPDATE cart_items SET quantity = quantity + 1 WHERE id = ?').run(existing.id);
  } else {
    db.prepare(
      'INSERT INTO cart_items (user_id, item_id, name, price, category) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, item_id, name || null, price || 0, category || null);
  }

  const items = db.prepare('SELECT * FROM cart_items WHERE user_id = ? ORDER BY created_at ASC').all(req.user.id);
  res.json({ items });
});

// ── Set quantity ──────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const { quantity } = req.body;
  if (quantity < 1) {
    db.prepare('DELETE FROM cart_items WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  } else {
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?')
      .run(quantity, req.params.id, req.user.id);
  }
  const items = db.prepare('SELECT * FROM cart_items WHERE user_id = ? ORDER BY created_at ASC').all(req.user.id);
  res.json({ items });
});

// ── Remove item ───────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  const items = db.prepare('SELECT * FROM cart_items WHERE user_id = ? ORDER BY created_at ASC').all(req.user.id);
  res.json({ items });
});

// ── Clear cart ────────────────────────────────────────────────────────────────
router.delete('/', (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);
  res.json({ items: [] });
});

module.exports = router;