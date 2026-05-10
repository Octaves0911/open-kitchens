/**
 * Stream token validation: live_streams, live_public_sessions, preview (in-memory).
 */
const { v4: uuidv4 } = require('uuid');

const PREVIEW_TTL_MS = 30 * 60 * 1000;
const previewTokens = new Map(); // token -> expiresAt (ms)

function issuePreviewToken() {
  cleanupPreview();
  const token = uuidv4();
  previewTokens.set(token, Date.now() + PREVIEW_TTL_MS);
  return token;
}

function revokePreviewToken(token) {
  previewTokens.delete(token);
}

function cleanupPreview() {
  const now = Date.now();
  for (const [t, exp] of previewTokens) {
    if (exp <= now) previewTokens.delete(t);
  }
}

function isPreviewTokenValid(token) {
  if (!token) return false;
  cleanupPreview();
  const exp = previewTokens.get(token);
  return exp != null && exp > Date.now();
}

function activePreviewCount() {
  cleanupPreview();
  return previewTokens.size;
}

function getConfigValue(db, key, defaultVal = null) {
  const row = db.prepare('SELECT value FROM restaurant_config WHERE key=?').get(key);
  if (!row || row.value == null || row.value === '') return defaultVal;
  return row.value;
}

function isBroadcastEnabled(db) {
  const v = getConfigValue(db, 'live_broadcast_enabled', '1');
  return v === '1' || v === 1 || v === true || String(v).toLowerCase() === 'true';
}

function getRtspUrl(db) {
  return getConfigValue(db, 'rtsp_url', '') || '';
}

function getWebrtcUrl(db) {
  const row = db.prepare('SELECT value FROM restaurant_config WHERE key=?').get('webrtc_url');
  if (!row || row.value == null) return '';
  return String(row.value).trim();
}

function getHlsUrl(db) {
  return getConfigValue(db, 'hls_url', '') || '';
}

function getPublicAllowlist(db) {
  const raw = getConfigValue(db, 'live_public_order_ids', '[]');
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((n) => parseInt(String(n), 10)).filter((n) => !Number.isNaN(n));
  } catch {
    return [];
  }
}

/**
 * @returns {{ ok: boolean, kind?: string, orderId?: number|null, reason?: string, startTranscoder?: boolean }}
 */
function validatePlayback(db, token) {
  if (!token) return { ok: false, reason: 'not_found' };

  if (isPreviewTokenValid(token)) {
    return { ok: true, kind: 'preview', orderId: null, startTranscoder: true };
  }

  const stream = db.prepare(
    `SELECT * FROM live_streams WHERE token=? AND status='active'`
  ).get(token);

  if (stream) {
    if (!isBroadcastEnabled(db)) {
      return { ok: false, kind: 'live', orderId: stream.order_id, reason: 'disabled' };
    }
    return { ok: true, kind: 'live', orderId: stream.order_id, startTranscoder: true };
  }

  db.prepare(`DELETE FROM live_public_sessions WHERE expires_at < datetime('now')`).run();

  const session = db.prepare(`SELECT * FROM live_public_sessions WHERE token=?`).get(token);
  if (session) {
    const allow = getPublicAllowlist(db);
    if (!isBroadcastEnabled(db)) {
      return { ok: false, kind: 'public', orderId: session.order_id, reason: 'disabled' };
    }
    if (!allow.includes(session.order_id)) {
      return { ok: false, kind: 'public', orderId: session.order_id, reason: 'not_allowed' };
    }
    return { ok: true, kind: 'public', orderId: session.order_id, startTranscoder: true };
  }

  return { ok: false, reason: 'not_found' };
}

/** Parse user input: 123, #OK000123, OK000123, ok000123 */
function normalizeOrderId(input) {
  if (input == null) return null;
  let s = String(input).trim().replace(/^#/, '');
  const m = s.match(/^ok0*(\d+)$/i);
  if (m) return parseInt(m[1], 10);
  const n = parseInt(s.replace(/\D/g, '') || s, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Resolve order id for public live entry: exact normalized id in allowlist first,
 * then exactly 4 digits matched against last 4 of decimal String(id) (same as portal / customer shorthand).
 * @param {string|null|undefined} rawInput
 * @param {number[]} allow
 * @returns {{ orderId: number } | { reason: string, error: string }}
 */
function resolvePublicLiveOrderId(rawInput, allow) {
  const list = Array.isArray(allow) ? allow : [];
  const trimmed = rawInput == null ? '' : String(rawInput).trim();
  if (!trimmed) {
    return { reason: 'invalid', error: 'Enter a valid order ID.' };
  }

  const n = normalizeOrderId(trimmed);
  if (n != null && list.includes(n)) {
    return { orderId: n };
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 4) {
    const matches = list.filter((id) => String(id).slice(-4) === digitsOnly);
    if (matches.length === 1) return { orderId: matches[0] };
    if (matches.length > 1) {
      return {
        reason: 'ambiguous',
        error: 'More than one order matches. Enter the full order number.',
      };
    }
  }

  return {
    reason: 'not_allowed',
    error: 'Order ID not recognized.',
  };
}

module.exports = {
  issuePreviewToken,
  revokePreviewToken,
  isPreviewTokenValid,
  activePreviewCount,
  isBroadcastEnabled,
  getRtspUrl,
  getWebrtcUrl,
  getHlsUrl,
  getPublicAllowlist,
  validatePlayback,
  normalizeOrderId,
  resolvePublicLiveOrderId,
};
