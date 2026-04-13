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
    const orderId = liveAccess.normalizeOrderId(req.body?.orderId);
    if (orderId == null) {
      return res.json({
        ok: false,
        reason: 'invalid',
        error: 'Enter a valid order ID.',
      });
    }
    if (!liveAccess.isBroadcastEnabled(db)) {
      return res.json({
        ok: false,
        reason: 'disabled',
        error: 'Live stream functionality is currently disabled.',
      });
    }
    const allow = liveAccess.getPublicAllowlist(db);
    if (!allow.includes(orderId)) {
      return res.json({
        ok: false,
        reason: 'not_allowed',
        error: 'Order ID not recognized.',
      });
    }

    db.prepare(`DELETE FROM live_public_sessions WHERE expires_at < datetime('now')`).run();
    const token = uuidv4();
    db.prepare(`
      INSERT INTO live_public_sessions (token, order_id, expires_at)
      VALUES (?, ?, datetime('now', '+2 hours'))
    `).run(token, orderId);

    res.json({
      ok: true,
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

module.exports = router;
