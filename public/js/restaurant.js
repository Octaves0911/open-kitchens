/**
 * Open Kitchens — Restaurant Portal JS
 * Handles: auth guard, tab switching, Orders/Menu/Offers/LivePrep tabs,
 * real-time WebSocket updates, full API integration.
 */

'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
const API    = (path, opts = {}) => apiFetch(path, opts);
const SECRET_KEY = 'ok_restaurant_secret';
let   secret = localStorage.getItem(SECRET_KEY) || '';

// ── Auth Guard ────────────────────────────────────────────────────────────────
function checkAuth() {
  if (!secret) { showAuthModal(); return false; }
  return true;
}

function showAuthModal() {
  document.getElementById('authOverlay').style.display = 'flex';
}

function hideAuthModal() {
  document.getElementById('authOverlay').style.display = 'none';
}

function submitSecret() {
  const val = document.getElementById('secretInput').value.trim();
  if (!val) return;
  secret = val;
  localStorage.setItem(SECRET_KEY, secret);
  hideAuthModal();
  init();
}

// ── API Helper ────────────────────────────────────────────────────────────────
async function apiFetch(path, { method = 'GET', body = null, form = null } = {}) {
  const opts = {
    method,
    headers: { 'x-restaurant-secret': encodeURIComponent(secret) }
  };
  if (form) {
    opts.body = form; // FormData — don't set Content-Type
  } else if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch('/api/restaurant' + path, opts);
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text ? text.slice(0, 120) : 'Invalid response' };
  }
  if (!res.ok) {
    if (res.status === 403) { secret = ''; localStorage.removeItem(SECRET_KEY); showAuthModal(); }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `rp-toast rp-toast-${type}`;
  t.textContent = msg;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
let ws = null;
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'register', userId: 'restaurant' }));
  ws.onmessage = ({ data }) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'order_update') onOrderUpdate(msg);
    } catch {}
  };
  ws.onclose = () => setTimeout(connectWS, 3000); // auto-reconnect
}

// ── Tab Switching ─────────────────────────────────────────────────────────────
const TABS = ['orders', 'menu', 'offers', 'liveprep', 'ratings', 'settings'];
let activeTab = 'orders';

function switchTab(name) {
  if (!checkAuth()) return;
  activeTab = name;
  TABS.forEach(t => {
    document.getElementById(`tab-btn-${t}`)?.classList.toggle('active', t === name);
    document.getElementById(`tab-${t}`)?.classList.toggle('active', t === name);
  });
  if (name === 'orders')   loadOrders();
  if (name === 'menu')     loadMenu();
  if (name === 'offers')   loadOffers();
  if (name === 'liveprep') loadLivePrep();
  if (name === 'ratings')  loadRatings();
  if (name === 'settings' && typeof settingsLoadAll === 'function') settingsLoadAll();
}

// ════════════════════════════════════════════════════════════════════════════════
// RATINGS TAB
// ════════════════════════════════════════════════════════════════════════════════
function starsRow(val) {
  const v = Number(val) || 0;
  let out = '';
  for (let i = 1; i <= 5; i++) out += `<span style="color:${i <= v ? '#E5B143' : '#D7CCC8'};">★</span>`;
  return `<span style="font-size:14px;letter-spacing:1px;">${out}</span>`;
}

function timeShort(s) {
  if (!s) return '—';
  try {
    const d = new Date(String(s).replace(' ', 'T') + 'Z');
    if (!isNaN(d.getTime())) return d.toLocaleString();
  } catch {}
  return String(s);
}

async function loadRatings() {
  const container = document.getElementById('ratingsList');
  if (!container) return;
  container.innerHTML = '<div class="rp-loading">Loading ratings…</div>';
  try {
    const data = await API('/ratings');
    const orders = (data && data.orders) || [];
    if (!orders.length) {
      container.innerHTML = '<div class="rp-empty">No stream feedback yet.</div>';
      return;
    }
    const avg = (arr) => {
      const nums = (arr || []).map(n => Number(n)).filter(n => Number.isFinite(n) && n >= 1 && n <= 5);
      if (!nums.length) return 0;
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    };

    container.innerHTML = orders.map((o, idx) => {
      const feedback = (o.feedback || []);
      const aLive = avg(feedback.map(f => f.liveIdea));
      const aTrust = avg(feedback.map(f => f.trust));
      const aAgain = avg(feedback.map(f => f.orderAgain));
      const aOverall = avg([aLive, aTrust, aAgain].filter(Boolean));
      const orderLabel = o.orderLabel || String(o.orderId).slice(-4);
      const detailsId = `ratings-details-${orderLabel}-${idx}`;

      const header = `
        <button type="button"
          class="rp-btn rp-btn-ghost"
          style="width:100%;padding:10px 10px;border:1.5px solid var(--border);border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px;"
          onclick="(function(){var d=document.getElementById('${detailsId}'); if(!d) return; d.style.display = (d.style.display==='none' || !d.style.display) ? 'block' : 'none';})()">
          <span style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0;">
            <span style="font-size:14px;font-weight:900;color:var(--brown-dark);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              Order #${orderLabel}
              ${o.orderStatus ? `<span style="margin-left:8px;font-size:11px;color:var(--text-light);font-weight:800;">(${o.orderStatus})</span>` : ''}
            </span>
            <span style="font-size:11px;color:var(--text-light);font-weight:700;">
              ${feedback.length} response${feedback.length === 1 ? '' : 's'}${o.orderCreatedAt ? ` · Placed: ${timeShort(o.orderCreatedAt)}` : ''}
            </span>
          </span>
          <span style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
            <span title="Average (overall)" style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:900;color:var(--text-mid);">
              <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;">${aOverall ? aOverall.toFixed(1) : '—'}</span>
              ${starsRow(Math.round(aOverall || 0))}
            </span>
            <span aria-hidden="true" style="font-size:14px;color:var(--text-light);">▾</span>
          </span>
        </button>
      `;

      const rows = feedback.map((f, i) => `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
            <div style="font-size:12px;color:var(--text-light);font-weight:800;">Response ${i + 1}</div>
            <div style="font-size:11px;color:var(--text-light);">Submitted: ${timeShort(f.createdAt)}</div>
          </div>
          <div style="margin-top:10px;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;">
            <div style="font-size:12px;color:var(--text-mid);font-weight:900;">Live kitchen idea</div>
            ${starsRow(f.liveIdea)}
            <div style="font-size:12px;color:var(--text-mid);font-weight:900;">Trust gained</div>
            ${starsRow(f.trust)}
            <div style="font-size:12px;color:var(--text-mid);font-weight:900;">Order again</div>
            ${starsRow(f.orderAgain)}
          </div>
        </div>
      `).join('');

      const details = `
        <div id="${detailsId}" style="display:none;margin-top:12px;">
          <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:12px;border:1px dashed var(--border);border-radius:12px;background:var(--cream);">
            <div style="font-size:12px;color:var(--text-mid);font-weight:900;">Averages</div>
            <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:flex-end;">
              <span style="font-size:12px;color:var(--text-mid);font-weight:900;">Idea ${starsRow(Math.round(aLive || 0))}</span>
              <span style="font-size:12px;color:var(--text-mid);font-weight:900;">Trust ${starsRow(Math.round(aTrust || 0))}</span>
              <span style="font-size:12px;color:var(--text-mid);font-weight:900;">Again ${starsRow(Math.round(aAgain || 0))}</span>
            </div>
          </div>
          ${rows}
        </div>
      `;

      return `<div class="rp-card">${header}${details}</div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = `<div class="rp-empty">Failed to load ratings: ${e.message}</div>`;
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// ORDERS TAB
// ════════════════════════════════════════════════════════════════════════════════
let ordersData = [];

async function loadOrders() {
  const container = document.getElementById('ordersList');
  container.innerHTML = '<div class="rp-loading">Loading orders…</div>';
  try {
    const { orders } = await API('/orders');
    ordersData = orders;
    renderOrders(orders);
    updateOrderBadge(orders.filter(o => o.status === 'placed').length);
  } catch (e) {
    container.innerHTML = `<div class="rp-empty">Failed to load orders: ${e.message}</div>`;
  }
}

function renderOrders(orders) {
  const container = document.getElementById('ordersList');
  if (!orders.length) {
    container.innerHTML = '<div class="rp-empty">No orders yet today.</div>';
    return;
  }
  const groups = {
    placed:    orders.filter(o => o.status === 'placed'),
    active:    orders.filter(o => ['accepted','preparing','ready'].includes(o.status)),
    done:      orders.filter(o => ['dispatched','delivered','declined'].includes(o.status)),
  };
  container.innerHTML = [
    groups.placed.length  ? `<div class="rp-group-label new-label">🔔 New Orders (${groups.placed.length})</div>`  + groups.placed.map(orderCard).join('') : '',
    groups.active.length  ? `<div class="rp-group-label">👩‍🍳 In Progress (${groups.active.length})</div>`             + groups.active.map(orderCard).join('') : '',
    groups.done.length    ? `<div class="rp-group-label done-label">✅ Completed / Declined (${groups.done.length})</div>` + groups.done.map(orderCard).join('') : '',
  ].join('');
}

function orderCard(o) {
  const items   = (o.items || []).map(i => `${i.name || i.item_id} ×${i.quantity || 1}`).join(', ');
  const since   = timeSince(o.created_at);
  const statusLabel = {
    placed: '🆕 New', accepted: '✅ Accepted', preparing: '👩‍🍳 Preparing',
    ready: '📦 Ready', dispatched: '🛵 Dispatched', delivered: '✔ Delivered', declined: '❌ Declined'
  }[o.status] || o.status;
  const statusClass = { placed:'badge-new', accepted:'badge-accepted', preparing:'badge-preparing',
    ready:'badge-ready', dispatched:'badge-dispatched', declined:'badge-declined' }[o.status] || '';

  const actions = o.status === 'placed' ? `
    <button class="rp-btn rp-btn-primary" onclick="updateOrder(${o.id},'accepted')">✅ Accept</button>
    <button class="rp-btn rp-btn-danger"  onclick="updateOrder(${o.id},'declined')">❌ Decline</button>` :
  o.status === 'accepted' ? `
    <button class="rp-btn rp-btn-amber"   onclick="updateOrder(${o.id},'preparing')">👩‍🍳 Start Preparing</button>` :
  o.status === 'preparing' ? `
    <button class="rp-btn rp-btn-primary" onclick="updateOrder(${o.id},'ready')">📦 Mark Ready</button>` :
  o.status === 'ready' ? `
    <button class="rp-btn rp-btn-primary" onclick="updateOrder(${o.id},'dispatched')">🛵 Dispatched</button>` : '';

  return `
  <div class="rp-order-card ${o.status === 'placed' ? 'card-new' : ''}" id="order-${o.id}">
    <div class="rp-order-head">
      <div>
        <span class="rp-order-id">#${formatOrderShortLabel(o.id)}</span>
        <span class="rp-status-badge ${statusClass}">${statusLabel}</span>
      </div>
      <span class="rp-order-time">${since}</span>
    </div>
    <div class="rp-order-items">${items || '—'}</div>
    <div class="rp-order-meta">
      👤 ${o.user_name || 'Guest'} · 📞 ${o.user_phone || '—'} · 💰 ₹${o.total || 0}
    </div>
    ${actions ? `<div class="rp-order-actions">${actions}</div>` : ''}
  </div>`;
}

async function updateOrder(id, status) {
  try {
    await API(`/orders/${id}`, { method: 'PATCH', body: { status } });
    showToast(`Order #${id} → ${status}`);
    loadOrders();
  } catch (e) { showToast(e.message, 'error'); }
}

function onOrderUpdate(msg) {
  // Refresh if on orders tab; show badge otherwise
  if (activeTab === 'orders') loadOrders();
  else if (msg.status === 'placed') {
    const badge = document.getElementById('orderBadge');
    const count = parseInt(badge.textContent || '0') + 1;
    updateOrderBadge(count);
    showToast('🔔 New order received!', 'info');
  }
}

function updateOrderBadge(count) {
  const badge = document.getElementById('orderBadge');
  badge.textContent = count || '';
  badge.style.display = count ? 'flex' : 'none';
}

// ════════════════════════════════════════════════════════════════════════════════
// MENU TAB
// ════════════════════════════════════════════════════════════════════════════════
let menuItems     = [];
let editingItemId = null;

async function loadMenu() {
  const container = document.getElementById('menuList');
  container.innerHTML = '<div class="rp-loading">Loading menu…</div>';
  try {
    const { items } = await API('/menu');
    menuItems = items;
    renderMenuList(items);
  } catch (e) {
    container.innerHTML = `<div class="rp-empty">Failed to load menu: ${e.message}</div>`;
  }
}

function renderMenuList(items) {
  const container = document.getElementById('menuList');
  const search = (document.getElementById('menuSearch')?.value || '').toLowerCase();
  const filtered = search ? items.filter(i => i.name.toLowerCase().includes(search) || (i.category||'').toLowerCase().includes(search)) : items;
  if (!filtered.length) { container.innerHTML = '<div class="rp-empty">No items found.</div>'; return; }

  // Group by category
  const groups = {};
  filtered.forEach(i => { const c = i.category || 'Other'; if (!groups[c]) groups[c] = []; groups[c].push(i); });
  container.innerHTML = Object.entries(groups).map(([cat, items]) => `
    <div class="rp-menu-category">
      <div class="rp-category-title">${cat}</div>
      ${items.map(menuItemRow).join('')}
    </div>`).join('');
}

function menuItemRow(item) {
  const img    = item.image_url ? `<img src="${item.image_url}" class="rp-item-thumb" alt="${item.name}"/>` : `<div class="rp-item-thumb-placeholder">${item.emoji || '🍽️'}</div>`;
  const veg    = item.is_veg ? '<span class="veg-dot">●</span>' : '<span class="nonveg-dot">●</span>';
  const addons = Array.isArray(item.addons) ? item.addons : JSON.parse(item.addons_json || '[]');
  const addonTag = addons.length
    ? `➕ ${addons.length} add-on${addons.length > 1 ? 's' : ''}: ${addons.map(a => a.name + (a.price ? ' +₹' + a.price : '')).join(', ')}`
    : '';
  const tags = [
    item.is_bestseller ? '⭐ Bestseller' : '',
    item.is_spicy      ? '🌶 Spicy'     : '',
    addonTag
  ].filter(Boolean).join(' · ');
  return `
  <div class="rp-menu-item ${!item.is_available ? 'item-unavailable' : ''}">
    ${img}
    <div class="rp-item-info">
      <div class="rp-item-name">${veg} ${item.name}</div>
      ${item.description ? `<div class="rp-item-desc">${item.description}</div>` : ''}
      ${tags ? `<div class="rp-item-tags">${tags}</div>` : ''}
      <div class="rp-item-price">₹${item.price}</div>
    </div>
    <div class="rp-item-actions">
      <label class="rp-toggle" title="${item.is_available ? 'Available' : 'Unavailable'}">
        <input type="checkbox" ${item.is_available ? 'checked' : ''} onchange="toggleAvailability(${item.id}, this.checked)"/>
        <span class="rp-toggle-slider"></span>
      </label>
      <button class="rp-btn rp-btn-sm rp-btn-outline" onclick="openItemForm(${item.id})">✏️</button>
      <button class="rp-btn rp-btn-sm rp-btn-danger"  onclick="deleteItem(${item.id}, '${item.name.replace(/'/g,"\\'")}')">🗑</button>
    </div>
  </div>`;
}

async function toggleAvailability(id, available) {
  try {
    await API(`/menu/${id}`, { method: 'PUT', body: { is_available: available ? 1 : 0 } });
    showToast(available ? 'Item marked available' : 'Item marked unavailable');
  } catch (e) { showToast(e.message, 'error'); loadMenu(); }
}

async function deleteItem(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    await API(`/menu/${id}`, { method: 'DELETE' });
    showToast(`"${name}" deleted`);
    loadMenu();
  } catch (e) { showToast(e.message, 'error'); }
}

function openItemForm(id = null) {
  editingItemId = id;
  const form  = document.getElementById('itemFormPanel');
  const title = document.getElementById('itemFormTitle');
  title.textContent = id ? 'Edit Menu Item' : 'Add Menu Item';
  resetItemForm();
  if (id) {
    const item = menuItems.find(i => i.id === id);
    if (!item) return;
    document.getElementById('iName').value        = item.name;
    document.getElementById('iCategory').value    = item.category || '';
    document.getElementById('iPrice').value       = item.price;
    document.getElementById('iDesc').value        = item.description || '';
    document.getElementById('iVeg').checked        = !!item.is_veg;
    document.getElementById('iBestseller').checked = !!item.is_bestseller;
    document.getElementById('iSpicy').checked      = !!item.is_spicy;
    document.getElementById('iAvail').checked      = item.is_available !== 0;
    document.getElementById('iFanFav').checked     = !!item.is_fan_favourite;
    if (item.image_url) {
      document.getElementById('iImgPreview').src          = item.image_url;
      document.getElementById('iImgPreviewWrap').style.display = 'block';
    }
    renderAddons(item.addons || []);
  }
  document.getElementById('menuList').style.display = 'none';
  document.getElementById('menuToolbar').style.display = 'none';
  form.style.display = 'block';
}

function closeItemForm() {
  document.getElementById('itemFormPanel').style.display = 'none';
  document.getElementById('menuList').style.display = 'block';
  document.getElementById('menuToolbar').style.display = 'flex';
  editingItemId = null;
}

function resetItemForm() {
  ['iName','iCategory','iPrice','iDesc'].forEach(id => document.getElementById(id).value = '');
  ['iVeg','iBestseller','iSpicy','iAvail','iFanFav'].forEach(id => document.getElementById(id).checked = false);
  document.getElementById('iVeg').checked   = true;
  document.getElementById('iAvail').checked = true;
  document.getElementById('iImgPreviewWrap').style.display = 'none';
  document.getElementById('iImgFile').value = '';
  document.getElementById('addonsContainer').innerHTML = '';
}

// ── Add-ons editor ────────────────────────────────────────────────────────────
function renderAddons(addons) {
  document.getElementById('addonsContainer').innerHTML = addons.map((a, i) => addonRow(a, i)).join('');
}

function addonRow(addon = {}, idx = Date.now()) {
  return `
  <div class="rp-addon-row" id="addon-${idx}">
    <input class="rp-input rp-addon-name"  placeholder="Add-on name"  value="${addon.name  || ''}"/>
    <input class="rp-input rp-addon-price" placeholder="Price (₹)" type="number" min="0" value="${addon.price || 0}"/>
    <button class="rp-btn rp-btn-sm rp-btn-danger" onclick="this.closest('.rp-addon-row').remove()">✕</button>
  </div>`;
}

function addAddonRow() {
  const c = document.getElementById('addonsContainer');
  const div = document.createElement('div');
  div.innerHTML = addonRow({}, Date.now());
  c.appendChild(div.firstElementChild);
}

function collectAddons() {
  return [...document.querySelectorAll('.rp-addon-row')].map(row => ({
    name:  row.querySelector('.rp-addon-name').value.trim(),
    price: parseFloat(row.querySelector('.rp-addon-price').value) || 0
  })).filter(a => a.name);
}

// ── Image preview ─────────────────────────────────────────────────────────────
function onImageSelect(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('iImgPreview').src = e.target.result;
    document.getElementById('iImgPreviewWrap').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function saveItem() {
  const name  = document.getElementById('iName').value.trim();
  const price = document.getElementById('iPrice').value;
  if (!name || !price) { showToast('Name and price are required', 'error'); return; }

  const form = new FormData();
  form.append('name',         name);
  form.append('category',     document.getElementById('iCategory').value.trim());
  form.append('description',  document.getElementById('iDesc').value.trim());
  form.append('price',        price);
  form.append('is_veg',       document.getElementById('iVeg').checked        ? 1 : 0);
  form.append('is_bestseller',  document.getElementById('iBestseller').checked ? 1 : 0);
  form.append('is_spicy',       document.getElementById('iSpicy').checked      ? 1 : 0);
  form.append('is_available',   document.getElementById('iAvail').checked      ? 1 : 0);
  form.append('is_fan_favourite', document.getElementById('iFanFav').checked   ? 1 : 0);
  form.append('addons',       JSON.stringify(collectAddons()));
  const file = document.getElementById('iImgFile').files[0];
  if (file) form.append('image', file);

  try {
    if (editingItemId) {
      await API(`/menu/${editingItemId}`, { method: 'PUT', form });
      showToast('Item updated ✅');
    } else {
      await API('/menu', { method: 'POST', form });
      showToast('Item added ✅');
    }
    closeItemForm();
    loadMenu();
  } catch (e) { showToast(e.message, 'error'); }
}

// ════════════════════════════════════════════════════════════════════════════════
// OFFERS TAB
// ════════════════════════════════════════════════════════════════════════════════
let offersData    = [];
let editingOfferId = null;

async function loadOffers() {
  const container = document.getElementById('offersList');
  container.innerHTML = '<div class="rp-loading">Loading offers…</div>';
  try {
    const { offers } = await API('/offers');
    offersData = offers;
    renderOffers(offers);
  } catch (e) {
    container.innerHTML = `<div class="rp-empty">Failed to load offers: ${e.message}</div>`;
  }
}

function renderOffers(offers) {
  const container = document.getElementById('offersList');
  if (!offers.length) { container.innerHTML = '<div class="rp-empty">No offers yet. Create one above!</div>'; return; }
  container.innerHTML = offers.map(offerCard).join('');
}

function offerCard(o) {
  const disc  = o.discount_type === 'percent' ? `${o.discount_value}% off` : `₹${o.discount_value} off`;
  const valid = o.valid_until ? `Valid until ${new Date(o.valid_until).toLocaleDateString('en-IN')}` : 'No expiry';
  return `
  <div class="rp-offer-card ${!o.is_active ? 'offer-inactive' : ''}">
    <div class="rp-offer-head">
      <div>
        <span class="rp-offer-code">${o.code}</span>
        <span class="rp-offer-disc">${disc}</span>
      </div>
      <label class="rp-toggle">
        <input type="checkbox" ${o.is_active ? 'checked' : ''} onchange="toggleOffer(${o.id}, this.checked)"/>
        <span class="rp-toggle-slider"></span>
      </label>
    </div>
    <div class="rp-offer-title">${o.title}</div>
    ${o.description ? `<div class="rp-offer-desc">${o.description}</div>` : ''}
    <div class="rp-offer-meta">
      Min ₹${o.min_order || 0} · ${valid} · Used ${o.usage_count || 0}×${o.usage_limit ? '/' + o.usage_limit : ''}
    </div>
    <div class="rp-offer-actions">
      <button class="rp-btn rp-btn-sm rp-btn-outline" onclick="openOfferForm(${o.id})">✏️ Edit</button>
      <button class="rp-btn rp-btn-sm rp-btn-danger"  onclick="deleteOffer(${o.id}, '${o.code}')">🗑 Delete</button>
    </div>
  </div>`;
}

async function toggleOffer(id, active) {
  try {
    await API(`/offers/${id}`, { method: 'PUT', body: { is_active: active ? 1 : 0 } });
    showToast(active ? 'Offer activated' : 'Offer deactivated');
    loadOffers();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteOffer(id, code) {
  if (!confirm(`Delete offer "${code}"?`)) return;
  try {
    await API(`/offers/${id}`, { method: 'DELETE' });
    showToast(`Offer "${code}" deleted`);
    loadOffers();
  } catch (e) { showToast(e.message, 'error'); }
}

// Offer image preview helpers
function previewOfferImage(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('oImgPreview').src = e.target.result;
    document.getElementById('oImgPreviewWrap').style.display = 'block';
  };
  reader.readAsDataURL(file);
}
function clearOfferImage() {
  document.getElementById('oImgFile').value = '';
  document.getElementById('oImgPreview').src = '';
  document.getElementById('oImgPreviewWrap').style.display = 'none';
}

function openOfferForm(id = null) {
  editingOfferId = id;
  resetOfferForm();
  document.getElementById('offerFormTitle').textContent = id ? 'Edit Offer' : 'New Offer';
  if (id) {
    const o = offersData.find(x => x.id === id);
    if (!o) return;
    document.getElementById('oCode').value         = o.code;
    document.getElementById('oTitle').value        = o.title;
    document.getElementById('oDesc').value         = o.description || '';
    document.getElementById('oType').value         = o.discount_type;
    document.getElementById('oValue').value        = o.discount_value;
    document.getElementById('oMinOrder').value     = o.min_order || 0;
    document.getElementById('oMaxDisc').value      = o.max_discount || '';
    document.getElementById('oValidUntil').value   = o.valid_until ? o.valid_until.split('T')[0] : '';
    document.getElementById('oUsageLimit').value   = o.usage_limit || '';
    document.getElementById('oEmoji').value        = o.emoji    || '';
    document.getElementById('oBadge').value        = o.badge    || '';
    document.getElementById('oOldPrice').value     = o.old_price || '';
    if (o.image_url) {
      document.getElementById('oImgPreview').src = o.image_url;
      document.getElementById('oImgPreviewWrap').style.display = 'block';
    }
  }
  document.getElementById('offerFormPanel').style.display = 'block';
  document.getElementById('offerFormPanel').scrollIntoView({ behavior: 'smooth' });
}

function closeOfferForm() {
  document.getElementById('offerFormPanel').style.display = 'none';
  editingOfferId = null;
}

function resetOfferForm() {
  ['oCode','oTitle','oDesc','oValue','oMinOrder','oMaxDisc','oValidUntil','oUsageLimit','oEmoji','oBadge','oOldPrice']
    .forEach(id => document.getElementById(id).value = '');
  document.getElementById('oType').value = 'percent';
  clearOfferImage();
}

async function saveOffer() {
  const code  = document.getElementById('oCode').value.trim().toUpperCase();
  const title = document.getElementById('oTitle').value.trim();
  const value = document.getElementById('oValue').value;
  if (!code || !title || !value) { showToast('Code, title and discount value required', 'error'); return; }

  // Use FormData to support image upload
  const form = new FormData();
  form.append('code',           code);
  form.append('title',          title);
  form.append('description',    document.getElementById('oDesc').value.trim()     || '');
  form.append('discount_type',  document.getElementById('oType').value);
  form.append('discount_value', parseFloat(value));
  form.append('min_order',      parseFloat(document.getElementById('oMinOrder').value) || 0);
  form.append('max_discount',   document.getElementById('oMaxDisc').value   || '');
  form.append('valid_until',    document.getElementById('oValidUntil').value || '');
  form.append('usage_limit',    document.getElementById('oUsageLimit').value || '');
  form.append('emoji',          document.getElementById('oEmoji').value.trim()    || '');
  form.append('badge',          document.getElementById('oBadge').value.trim()    || '');
  form.append('old_price',      document.getElementById('oOldPrice').value        || '');
  form.append('is_active',      1);
  const imgFile = document.getElementById('oImgFile').files[0];
  if (imgFile) form.append('image', imgFile);

  try {
    if (editingOfferId) {
      await API(`/offers/${editingOfferId}`, { method: 'PUT', form });
      showToast('Offer updated ✅');
    } else {
      await API('/offers', { method: 'POST', form });
      showToast('Offer created ✅');
    }
    closeOfferForm();
    loadOffers();
  } catch (e) { showToast(e.message, 'error'); }
}

// ════════════════════════════════════════════════════════════════════════════════
// LIVE PREP TAB
// ════════════════════════════════════════════════════════════════════════════════
let livePublicOrderIds   = [];
let portalHlsInstance    = null;
let hlsUrl               = '';
let webrtcViewerUrl      = '';

function normalizeOrderIdInput(input) {
  if (input == null) return null;
  let s = String(input).trim().replace(/^#/, '');
  const m = s.match(/^ok0*(\d+)$/i);
  if (m) return parseInt(m[1], 10);
  const digits = s.replace(/\D/g, '');
  const n = parseInt(digits || s, 10);
  return Number.isNaN(n) ? null : n;
}

/** Customer + portal display: last 4 characters of numeric id (no OK / no zero-pad beyond slice). */
function formatOrderShortLabel(id) {
  if (id == null || Number.isNaN(Number(id))) return '—';
  return String(Number(id)).slice(-4);
}

async function loadLivePrep() {
  try {
    const { value } = await API('/config/webrtc_url');
    webrtcViewerUrl = value || '';
    const w = document.getElementById('webrtcInput');
    if (w) w.value = webrtcViewerUrl;
  } catch {}
  try {
    const { value } = await API('/config/hls_url');
    hlsUrl = value || '';
    const el = document.getElementById('hlsInput');
    if (el) el.value = hlsUrl;
  } catch {}
  try {
    const bc = await API('/config/live_broadcast_enabled');
    const raw = bc.value;
    const on = raw !== '0' && String(raw).toLowerCase() !== 'false';
    const el = document.getElementById('liveBroadcastToggle');
    if (el) el.checked = on;
  } catch {}
  try {
    const { value } = await API('/config/live_public_order_ids');
    livePublicOrderIds = [];
    if (value) {
      const arr = JSON.parse(value);
      if (Array.isArray(arr)) {
        livePublicOrderIds = arr.map((n) => parseInt(String(n), 10)).filter((n) => !Number.isNaN(n));
      }
    }
    renderPublicOrderIds();
  } catch {}
  loadAcceptedOrders();
}

async function onLiveBroadcastToggle() {
  const el = document.getElementById('liveBroadcastToggle');
  const on = el.checked;
  try {
    await API('/config/live_broadcast_enabled', { method: 'PUT', body: { value: on ? '1' : '0' } });
    showToast(on ? 'Customer live stream enabled' : 'Customer live stream disabled');
  } catch (e) {
    showToast(e.message, 'error');
    el.checked = !on;
  }
}

function makeLowLatencyHls() {
  return new Hls({
    lowLatencyMode: true,
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 5,
    maxBufferLength: 15,
    backBufferLength: 10,
    fragLoadingTimeOut: 20000,
    manifestLoadingTimeOut: 20000,
  });
}

function renderPublicOrderIds() {
  const box = document.getElementById('liveOrderIdChips');
  if (!box) return;
  box.innerHTML = livePublicOrderIds.map((id) => `
    <span class="rp-order-chip">#${formatOrderShortLabel(id)}
      <button type="button" class="rp-order-chip-x" onclick="removePublicOrderId(${id})" aria-label="Remove">×</button>
    </span>
  `).join('');
}

async function savePublicOrderIdsToServer() {
  await API('/config/live_public_order_ids', {
    method: 'PUT',
    body: { value: JSON.stringify(livePublicOrderIds) },
  });
}

async function addPublicOrderId() {
  const input = document.getElementById('liveOrderIdInput');
  const id = normalizeOrderIdInput(input.value);
  if (id == null) { showToast('Invalid order ID', 'error'); return; }
  if (livePublicOrderIds.includes(id)) { showToast('Already in list', 'error'); return; }
  livePublicOrderIds.push(id);
  input.value = '';
  renderPublicOrderIds();
  try {
    await savePublicOrderIdsToServer();
    showToast('Order ID saved for live access');
  } catch (e) {
    livePublicOrderIds.pop();
    renderPublicOrderIds();
    showToast(e.message, 'error');
  }
}

async function removePublicOrderId(id) {
  livePublicOrderIds = livePublicOrderIds.filter((x) => x !== id);
  renderPublicOrderIds();
  try {
    await savePublicOrderIdsToServer();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function openHlsPreview() {
  const input = document.getElementById('hlsInput');
  const url = (input?.value || hlsUrl || '').trim();
  if (!url) { showToast('Enter an HLS (.m3u8) URL first', 'error'); return; }

  const modal = document.getElementById('hlsPreviewModal');
  const status = document.getElementById('hlsPreviewStatus');
  const video = document.getElementById('hlsPreviewVideo');
  if (!modal || !video) return;
  closeHlsPreviewQuiet();
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  status.textContent = 'Loading HLS…';

  if (typeof Hls !== 'undefined' && Hls.isSupported()) {
    portalHlsInstance = makeLowLatencyHls();
    // Match customer behavior (some CDNs rely on redirects/cookies)
    portalHlsInstance.config.xhrSetup = function (xhr) { xhr.withCredentials = true; };
    portalHlsInstance.loadSource(url);
    portalHlsInstance.attachMedia(video);
    portalHlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      status.textContent = '';
      video.play().catch(() => {});
    });
    portalHlsInstance.on(Hls.Events.ERROR, (_, errData) => {
      if (errData.fatal) status.textContent = 'Playback failed — check HLS URL and CDN CORS.';
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari native HLS
    video.src = url;
    video.addEventListener('loadedmetadata', () => {
      status.textContent = '';
      video.play().catch(() => {});
    }, { once: true });
  } else {
    status.textContent = 'HLS not supported in this browser.';
  }
}

function closeHlsPreviewQuiet() {
  const video = document.getElementById('hlsPreviewVideo');
  if (portalHlsInstance) {
    portalHlsInstance.destroy();
    portalHlsInstance = null;
  }
  if (video) {
    video.removeAttribute('src');
    video.load();
  }
}

function closeHlsPreview() {
  const modal = document.getElementById('hlsPreviewModal');
  closeHlsPreviewQuiet();
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
}

async function saveWebrtcUrl() {
  const input = document.getElementById('webrtcInput');
  const url = (input?.value || '').trim();
  try {
    await API('/config/webrtc_url', { method: 'PUT', body: { value: url } });
    webrtcViewerUrl = url;
    showToast(url ? 'WebRTC URL saved — customers will use WebRTC on /stream' : 'WebRTC cleared — customers use HLS');
  } catch (e) {
    showToast(e.message || 'Could not save WebRTC URL (check portal access)', 'error');
  }
}

function closeWebrtcPreviewQuiet() {
  const frame = document.getElementById('webrtcPreviewFrame');
  if (frame) {
    frame.onload = null;
    frame.removeAttribute('src');
    try { frame.src = 'about:blank'; } catch {}
  }
}

function closeWebrtcPreview() {
  const modal = document.getElementById('webrtcPreviewModal');
  closeWebrtcPreviewQuiet();
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
}

function openWebrtcPreview() {
  const input = document.getElementById('webrtcInput');
  const url = (input?.value || webrtcViewerUrl || '').trim();
  if (!url) {
    showToast('Paste your WebRTC / embed URL in the field, then preview or save.', 'error');
    return;
  }
  const modal = document.getElementById('webrtcPreviewModal');
  const frame = document.getElementById('webrtcPreviewFrame');
  const status = document.getElementById('webrtcPreviewStatus');
  if (!modal || !frame) {
    showToast('Preview UI missing — refresh the page.', 'error');
    return;
  }
  closeWebrtcPreviewQuiet();
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  if (status) status.textContent = 'Loading embed…';
  frame.onload = () => { if (status) status.textContent = ''; };
  frame.referrerPolicy = 'no-referrer';
  frame.src = url;
}

async function saveHlsUrl() {
  const input = document.getElementById('hlsInput');
  const url = (input?.value || '').trim();
  if (!url) { showToast('Enter an HLS (.m3u8) URL first', 'error'); return; }
  try {
    await API('/config/hls_url', { method: 'PUT', body: { value: url } });
    hlsUrl = url;
    showToast('HLS URL saved ✅');
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadAcceptedOrders() {
  const container = document.getElementById('acceptedOrdersList');
  container.innerHTML = '<div class="rp-loading">Loading…</div>';
  try {
    const { orders } = await API('/orders?status=accepted');
    const preparing  = (await API('/orders?status=preparing')).orders;
    const combined   = [...orders, ...preparing];
    if (!combined.length) {
      container.innerHTML = '<div class="rp-empty">No accepted orders right now.</div>';
      return;
    }
    // Load active streams to know which orders are already streaming
    const { streams } = await API('/stream/active').catch(() => ({ streams: [] }));
    const streamingIds = new Set(streams.map(s => s.order_id));

    container.innerHTML = combined.map(o => {
      const items   = (o.items || []).map(i => `${i.name || i.item_id} ×${i.quantity || 1}`).join(', ');
      const streaming = streamingIds.has(o.id);
      return `
      <div class="rp-live-order" id="live-order-${o.id}">
        <div class="rp-live-order-info">
          <span class="rp-order-id">#${formatOrderShortLabel(o.id)}</span>
          <span class="rp-live-items">${items}</span>
          <span class="rp-live-user">👤 ${o.user_name || 'Guest'}</span>
        </div>
        <div class="rp-live-controls">
          ${streaming
            ? `<span class="live-badge-sm">🔴 LIVE</span>
               <button class="rp-btn rp-btn-danger rp-btn-sm" onclick="stopStream(${o.id})">⏹ Stop</button>`
            : `<button class="rp-btn rp-btn-primary rp-btn-sm" onclick="startStream(${o.id})">▶ Start</button>`
          }
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = `<div class="rp-empty">Failed to load orders: ${e.message}</div>`;
  }
}

async function startStream(orderId) {
  try {
    const { streamUrl, token } = await API(`/stream/start/${orderId}`, { method: 'POST' });
    showToast(`🔴 Stream started — customer notified`, 'success');
    // Show copy link
    const row = document.getElementById(`live-order-${orderId}`);
    if (row) {
      row.querySelector('.rp-live-controls').innerHTML = `
        <span class="live-badge-sm">🔴 LIVE</span>
        <button class="rp-btn rp-btn-sm rp-btn-outline" onclick="copyStreamLink('${token}')">🔗 Copy Link</button>
        <button class="rp-btn rp-btn-danger rp-btn-sm" onclick="stopStream(${orderId})">⏹ Stop</button>`;
    }
  } catch (e) { showToast(e.message, 'error'); }
}

async function stopStream(orderId) {
  try {
    await API(`/stream/stop/${orderId}`, { method: 'POST' });
    showToast('Stream stopped', 'success');
    loadAcceptedOrders();
  } catch (e) { showToast(e.message, 'error'); }
}

function copyStreamLink(token) {
  const url = `${location.origin}/stream?token=${token}`;
  navigator.clipboard.writeText(url).then(() => showToast('Stream link copied!'));
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const { orders } = await API('/orders');
    const today = orders.filter(o => {
      const d = new Date(o.created_at);
      const now = new Date();
      return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
    });
    document.getElementById('statToday').textContent    = today.length;
    document.getElementById('statPending').textContent  = today.filter(o => o.status === 'placed').length;
    document.getElementById('statRevenue').textContent  = '₹' + today.filter(o => !['declined'].includes(o.status)).reduce((s, o) => s + (o.total || 0), 0).toFixed(0);
    document.getElementById('statAccepted').textContent = today.filter(o => ['accepted','preparing','ready','dispatched','delivered'].includes(o.status)).length;
  } catch {}
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function timeSince(dateStr) {
  const secs = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (secs < 60)  return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`;
  return `${Math.floor(secs/3600)}h ago`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  connectWS();
  loadStats();
  switchTab('orders');
  // Refresh stats every 60s
  setInterval(loadStats, 60000);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('webrtcSaveBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    saveWebrtcUrl();
  });
  document.getElementById('webrtcPreviewBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openWebrtcPreview();
  });
  document.getElementById('webrtcPreviewCloseBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeWebrtcPreview();
  });
  if (secret) init();
  else showAuthModal();
});

// Inline handlers in restaurant.html (e.g. Enter key) resolve on window
window.saveWebrtcUrl = saveWebrtcUrl;
window.openWebrtcPreview = openWebrtcPreview;
window.closeWebrtcPreview = closeWebrtcPreview;