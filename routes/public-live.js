/**
 * Public customer API — order ID gate for live stream (no restaurant auth).
 */
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const db      = require('../db/database');
const liveAccess = require('../lib/live-stream-access');

// POST /api/public/live/session  { orderId }
router.post('/session', (req, res) => {
  try {
    if (!liveAccess.isBroadcastEnabled(db)) {
      return res.json({
        ok: false,
        reason: 'disabled',
        error: 'Live stream functionality is currently disabled.',
      });
    }
    const allow = liveAccess.getPublicAllowlist(db);
    const resolved = liveAccess.resolvePublicLiveOrderId(req.body && req.body.orderId, allow);
    if (!('orderId' in resolved)) {
      return res.json({
        ok: false,
        reason: resolved.reason || 'invalid',
        error: resolved.error || 'Enter a valid order ID.',
      });
    }
    const { orderId } = resolved;

    db.prepare(`DELETE FROM live_public_sessions WHERE expires_at < datetime('now')`).run();
    const token = uuidv4();
    db.prepare(`
      INSERT INTO live_public_sessions (token, order_id, expires_at)
      VALUES (?, ?, datetime('now', '+2 hours'))
    `).run(token, orderId);

    const orderLabel = `OK${String(Number(orderId)).padStart(6, '0')}`;
    res.json({
      ok: true,
      orderId,
      orderLabel,
      streamUrl: `/stream?token=${encodeURIComponent(token)}`,
    });
  } catch (err) {
    console.error('[public-live/session]', err);
    res.status(500).json({
      ok: false,
      error: 'Server error. Please try again.',
    });
  }
});

// POST /api/public/live/feedback  { token, liveIdea, trust, orderAgain }
router.post('/feedback', (req, res) => {
  try {
    const token = String((req.body && req.body.token) || '').trim();
    if (!token) return res.status(400).json({ ok: false, error: 'Missing token.' });

    const row = db.prepare(`
      SELECT order_id
      FROM live_public_sessions
      WHERE token=? AND expires_at >= datetime('now')
      LIMIT 1
    `).get(token);
    if (!row) return res.status(404).json({ ok: false, error: 'Session expired or invalid.' });

    const liveIdea = Number((req.body && req.body.liveIdea) || 0);
    const trust = Number((req.body && req.body.trust) || 0);
    const orderAgain = Number((req.body && req.body.orderAgain) || 0);

    const isValid = (n) => Number.isInteger(n) && n >= 1 && n <= 5;
    if (![liveIdea, trust, orderAgain].every(isValid)) {
      return res.status(400).json({ ok: false, error: 'Ratings must be integers 1–5.' });
    }

    db.prepare(`
      INSERT INTO stream_feedback (token, order_id, live_idea, trust, order_again)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET
        order_id=excluded.order_id,
        live_idea=excluded.live_idea,
        trust=excluded.trust,
        order_again=excluded.order_again,
        created_at=CURRENT_TIMESTAMP
    `).run(token, row.order_id, liveIdea, trust, orderAgain);

    res.json({ ok: true });
  } catch (err) {
    console.error('[public-live/feedback]', err);
    res.status(500).json({ ok: false, error: 'Server error. Please try again.' });
  }
});

module.exports = router;
