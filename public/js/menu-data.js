// ─── Open Kitchens Menu Data ──────────────────────────────────────────────
// Menu is loaded dynamically from /api/menu (backed by the DB).
// MENU_DATA starts empty and is populated after the API call.

let MENU_DATA = [];

// Normalise a DB item → legacy shape used by renderMenu() / addToCart()
function _normaliseItem(i) {
  const meta = (typeof i.metadata === 'object' ? i.metadata : {});
  return {
    id:           i.id,
    category:     i.category  || 'Other',
    name:         i.name,
    price:        i.price,
    desc:         i.description || '',
    emoji:        i.emoji || meta.emoji || '🍽️',
    veg:          !!i.is_veg,
    bestSeller:   !!i.is_bestseller,
    spicy:        !!i.is_spicy,
    available:    i.is_available !== 0,
    fanFavourite: !!i.is_fan_favourite,
    image_url:    i.image_url   || null,
    addons:       i.addons      || [],
  };
}

// Render the Fan Favourites section from MENU_DATA
function loadFanFavourites() {
  const grid    = document.getElementById('fanFavGrid');
  const section = document.getElementById('fanFavSection');
  if (!grid) return;
  const favs = MENU_DATA.filter(i => i.fanFavourite && i.available);
  if (!favs.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--text-light);font-size:13px;">No fan favourites selected yet.</div>';
    return;
  }
  grid.innerHTML = favs.map(item => `
    <div class="fav-card" onclick="openItemModal(${item.id})">
      ${item.image_url
        ? `<div style="height:100px;overflow:hidden;border-radius:12px 12px 0 0;">
             <img src="${item.image_url}" alt="${item.name}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;"/>
           </div>`
        : `<div style="font-size:48px;text-align:center;padding:16px 8px 8px;">${item.emoji}</div>`}
      <div style="padding:0 12px 14px;">
        <div style="font-size:14px;font-weight:700;color:var(--brown-dark);">${item.name}</div>
        <div style="font-size:12px;color:var(--text-light);margin-top:2px;">${item.desc.slice(0,40)}${item.desc.length>40?'…':''}</div>
        <div style="margin-top:6px;display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:15px;font-weight:800;color:var(--rust);">&#8377;${item.price}</span>
          <span style="background:var(--rust);color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;">ADD</span>
        </div>
      </div>
    </div>`).join('');
}

async function _loadMenuFromAPI() {
  try {
    const res  = await fetch('/api/menu?_=' + Date.now());
    const data = await res.json();
    MENU_DATA  = (data.items || []).map(_normaliseItem);
    // Re-derive CATEGORIES after load
    CATEGORIES.length = 0;
    [...new Set(MENU_DATA.map(i => i.category))].forEach(c => CATEGORIES.push(c));
    // Re-render category bar, menu grid, and fan favourites
    if (typeof renderCategoryBar  === 'function') renderCategoryBar();
    if (typeof renderMenu         === 'function') renderMenu();
    loadFanFavourites();
  } catch (e) {
    console.warn('[menu-data] Could not load menu from API:', e.message);
  }
}

// Auto-refresh: reload when tab refocused OR every 30 seconds
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) _loadMenuFromAPI();
});
setInterval(_loadMenuFromAPI, 30 * 1000);

// ── Legacy static array kept for reference (now unused — DB is source of truth)
const _STATIC_MENU_BACKUP = [
  // ── Breakfast ──────────────────────────────────────────────────────────
  {
    id: 1, category: 'Breakfast', name: 'Indori Poha', price: 119,
    desc: 'Light flattened rice with curry leaves, peanuts & sev',
    emoji: '🍛', veg: true, bestSeller: true, spicy: false
  },
  {
    id: 2, category: 'Breakfast', name: 'Veg Sandwich', price: 109,
    desc: 'Fresh veggies with mint chutney on toasted bread',
    emoji: '🥪', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 3, category: 'Breakfast', name: 'Veg Cheese Sandwich', price: 129,
    desc: 'Loaded with veggies and melted cheese',
    emoji: '🥪', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 4, category: 'Breakfast', name: 'Grilled Veg Cheese Sandwich', price: 149,
    desc: 'Crispy grilled sandwich with cheese & mixed veggies',
    emoji: '🥪', veg: true, bestSeller: true, spicy: false
  },
  {
    id: 5, category: 'Breakfast', name: 'Poori Sabzi', price: 139,
    desc: 'Fluffy deep-fried pooris with spiced aloo sabzi',
    emoji: '🍽️', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 6, category: 'Breakfast', name: 'Bread Butter', price: 59,
    desc: 'Classic toasted bread with generous butter',
    emoji: '🍞', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 7, category: 'Breakfast', name: 'Bread Omelette', price: 89,
    desc: 'Fluffy egg omelette on toasted bread, masala style',
    emoji: '🍳', veg: false, bestSeller: false, spicy: false
  },
  {
    id: 8, category: 'Breakfast', name: 'Bread Jam', price: 59,
    desc: 'Toasted bread with sweet mixed fruit jam',
    emoji: '🍞', veg: true, bestSeller: false, spicy: false
  },

  // ── Maggi ──────────────────────────────────────────────────────────────
  {
    id: 9, category: 'Maggi', name: 'Plain Maggi', price: 89,
    desc: 'Classic Maggi noodles with masala — comfort in a bowl',
    emoji: '🍜', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 10, category: 'Maggi', name: 'Cheese Maggi', price: 129,
    desc: 'Maggi loaded with melted cheese on top',
    emoji: '🍜', veg: true, bestSeller: true, spicy: false
  },
  {
    id: 11, category: 'Maggi', name: 'Veg Maggi', price: 119,
    desc: 'Maggi with fresh mixed vegetables & spices',
    emoji: '🍜', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 12, category: 'Maggi', name: 'Egg Maggi', price: 129,
    desc: 'Maggi with scrambled egg tossed right in',
    emoji: '🍜', veg: false, bestSeller: false, spicy: false
  },

  // ── Main Course ────────────────────────────────────────────────────────
  {
    id: 13, category: 'Main Course', name: 'Rajma', price: 169,
    desc: 'Rich kidney bean curry simmered in tomato-onion gravy',
    emoji: '🫘', veg: true, bestSeller: true, spicy: false
  },
  {
    id: 14, category: 'Main Course', name: 'Chole', price: 159,
    desc: 'Punjabi-style spiced chickpea curry',
    emoji: '🫘', veg: true, bestSeller: true, spicy: true
  },
  {
    id: 15, category: 'Main Course', name: 'Dal Tadka', price: 149,
    desc: 'Tempered yellow dal with ghee & cumin',
    emoji: '🍲', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 16, category: 'Main Course', name: 'Dal Fry', price: 139,
    desc: 'Smooth fried lentils with aromatic spices',
    emoji: '🍲', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 17, category: 'Main Course', name: 'Kala Chana', price: 149,
    desc: 'Black chickpea curry — protein-packed & earthy',
    emoji: '🫘', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 18, category: 'Main Course', name: 'Paneer Butter Masala', price: 219,
    desc: 'Creamy tomato-butter gravy with cottage cheese',
    emoji: '🧀', veg: true, bestSeller: true, spicy: false
  },
  {
    id: 19, category: 'Main Course', name: 'Kadhai Paneer', price: 219,
    desc: 'Bell peppers & paneer in smoky kadhai masala',
    emoji: '🧀', veg: true, bestSeller: false, spicy: true
  },
  {
    id: 20, category: 'Main Course', name: 'Shahi Paneer', price: 229,
    desc: 'Royal creamy paneer in cashew-onion gravy',
    emoji: '🧀', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 21, category: 'Main Course', name: 'Palak Paneer', price: 209,
    desc: 'Fresh spinach puree curry with paneer cubes',
    emoji: '🥬', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 22, category: 'Main Course', name: 'Palak Corn', price: 189,
    desc: 'Sweet corn & spinach in a mild green curry',
    emoji: '🌽', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 23, category: 'Main Course', name: 'Mushroom Masala', price: 199,
    desc: 'Button mushrooms in tangy spiced masala gravy',
    emoji: '🍄', veg: true, bestSeller: false, spicy: true
  },
  {
    id: 24, category: 'Main Course', name: 'Jeera Aloo', price: 139,
    desc: 'Cumin-tossed potatoes — simple & flavorful',
    emoji: '🥔', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 25, category: 'Main Course', name: 'Aloo Bhujiya', price: 129,
    desc: 'Dry spiced potato bhujiya, crispy & quick',
    emoji: '🥔', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 26, category: 'Main Course', name: 'Egg Curry', price: 169,
    desc: 'Boiled eggs in a rich onion-tomato masala',
    emoji: '🥚', veg: false, bestSeller: false, spicy: true
  },
  {
    id: 27, category: 'Main Course', name: 'Egg Bhurji', price: 129,
    desc: 'Scrambled eggs with onion, tomato & spices',
    emoji: '🍳', veg: false, bestSeller: false, spicy: false
  },
  {
    id: 28, category: 'Main Course', name: 'Paneer Bhurji', price: 199,
    desc: 'Crumbled paneer stir-fried with onion & spices',
    emoji: '🧀', veg: true, bestSeller: false, spicy: false
  },

  // ── Rice & Breads ──────────────────────────────────────────────────────
  {
    id: 29, category: 'Rice & Breads', name: 'Plain Rice', price: 99,
    desc: 'Steamed basmati rice, perfectly fluffy',
    emoji: '🍚', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 30, category: 'Rice & Breads', name: 'Jeera Rice', price: 119,
    desc: 'Cumin tempered basmati rice with ghee',
    emoji: '🍚', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 31, category: 'Rice & Breads', name: 'Veg Fried Rice', price: 139,
    desc: 'Wok-tossed rice with vegetables & soy sauce',
    emoji: '🍳', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 32, category: 'Rice & Breads', name: 'Veg Pulao', price: 129,
    desc: 'Fragrant spiced rice with whole vegetables',
    emoji: '🍚', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 33, category: 'Rice & Breads', name: 'Schezwan Fried Rice', price: 149,
    desc: 'Spicy Schezwan rice with veggies',
    emoji: '🌶️', veg: true, bestSeller: true, spicy: true
  },
  {
    id: 34, category: 'Rice & Breads', name: 'Dal Khichdi', price: 139,
    desc: 'Comforting dal-rice khichdi with ghee tadka',
    emoji: '🍲', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 35, category: 'Rice & Breads', name: 'Egg Fried Rice', price: 149,
    desc: 'Egg-scrambled fried rice, Indo-Chinese style',
    emoji: '🍳', veg: false, bestSeller: false, spicy: false
  },
  {
    id: 36, category: 'Rice & Breads', name: 'Fulka Roti (per pc)', price: 15,
    desc: 'Thin whole wheat roti cooked on open flame',
    emoji: '🫓', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 37, category: 'Rice & Breads', name: 'Butter Roti (per pc)', price: 20,
    desc: 'Fulka roti brushed with fresh butter',
    emoji: '🫓', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 38, category: 'Rice & Breads', name: 'Poori (4 pcs)', price: 89,
    desc: 'Deep fried puffed whole wheat bread, 4 pieces',
    emoji: '🫓', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 39, category: 'Rice & Breads', name: 'Ajwain Poori', price: 99,
    desc: 'Puffed pooris with carom seeds flavoring',
    emoji: '🫓', veg: true, bestSeller: false, spicy: false
  },

  // ── Parathas ───────────────────────────────────────────────────────────
  {
    id: 40, category: 'Parathas', name: 'Plain Paratha', price: 59,
    desc: 'Whole wheat layered paratha, served with pickle',
    emoji: '🫓', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 41, category: 'Parathas', name: 'Paneer Paratha', price: 139,
    desc: 'Stuffed with spiced cottage cheese, served with curd',
    emoji: '🫓', veg: true, bestSeller: true, spicy: false
  },
  {
    id: 42, category: 'Parathas', name: 'Aloo Paratha (2 pcs + curd)', price: 159,
    desc: 'Classic aloo-stuffed paratha with curd & pickle',
    emoji: '🫓', veg: true, bestSeller: true, spicy: false
  },
  {
    id: 43, category: 'Parathas', name: 'Sattu Paratha (2 pcs)', price: 149,
    desc: 'Bihari-style roasted gram flour stuffed paratha',
    emoji: '🫓', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 44, category: 'Parathas', name: 'Aloo Pyaaz Paratha', price: 129,
    desc: 'Potato & onion stuffed paratha with spice blend',
    emoji: '🫓', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 45, category: 'Parathas', name: 'Onion Paratha', price: 109,
    desc: 'Crispy paratha stuffed with spiced onions',
    emoji: '🫓', veg: true, bestSeller: false, spicy: false
  },

  // ── Combos ─────────────────────────────────────────────────────────────
  {
    id: 46, category: 'Combos', name: 'Litti Chokha', price: 169,
    desc: 'Bihari sattu-stuffed litti with roasted baigan chokha',
    emoji: '🍽️', veg: true, bestSeller: true, spicy: false
  },
  {
    id: 47, category: 'Combos', name: 'Sattu Kachori + Sabzi', price: 149,
    desc: 'Crispy sattu kachori served with spicy sabzi',
    emoji: '🫔', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 48, category: 'Combos', name: 'Veg Thali', price: 229,
    desc: '2 Rotis + Dal + Sabzi + Rice + Salad + Papad — complete meal',
    emoji: '🍱', veg: true, bestSeller: true, spicy: false
  },
  {
    id: 49, category: 'Combos', name: 'Egg Curry + Rice', price: 169,
    desc: 'Egg curry with steamed rice — a wholesome combo',
    emoji: '🍱', veg: false, bestSeller: false, spicy: false
  },
  {
    id: 50, category: 'Combos', name: 'Egg Curry + Roti', price: 159,
    desc: 'Egg curry served with 2 fulka rotis',
    emoji: '🍱', veg: false, bestSeller: false, spicy: false
  },
  {
    id: 51, category: 'Combos', name: 'Kadhi Pakoda + Rice', price: 149,
    desc: 'Tangy kadhi with pakodas & jeera rice',
    emoji: '🍱', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 52, category: 'Combos', name: 'Rajma Meal', price: 169,
    desc: 'Rajma + Jeera Rice + Salad + Papad',
    emoji: '🍱', veg: true, bestSeller: true, spicy: false
  },
  {
    id: 53, category: 'Combos', name: 'Chole Meal', price: 159,
    desc: 'Chole + 2 Rotis + Onion Salad + Pickle',
    emoji: '🍱', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 54, category: 'Combos', name: 'Dal Chawal + Aloo Bhujiya', price: 139,
    desc: 'Classic dal-rice with crispy aloo bhujiya',
    emoji: '🍱', veg: true, bestSeller: false, spicy: false
  },

  // ── Snacks ─────────────────────────────────────────────────────────────
  {
    id: 55, category: 'Snacks', name: 'Bread Pakoda', price: 69,
    desc: 'Spiced potato-stuffed bread, deep-fried golden',
    emoji: '🥪', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 56, category: 'Snacks', name: 'Bread Cutlet', price: 79,
    desc: 'Crispy fried bread patties with spiced filling',
    emoji: '🥙', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 57, category: 'Snacks', name: 'Dal Kachori', price: 79,
    desc: 'Flaky kachori stuffed with spiced lentil filling',
    emoji: '🫔', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 58, category: 'Snacks', name: 'Mix Veg Pakoda', price: 109,
    desc: 'Crispy mixed vegetable fritters with green chutney',
    emoji: '🥦', veg: true, bestSeller: false, spicy: true
  },
  {
    id: 59, category: 'Snacks', name: 'Paneer Pakoda', price: 139,
    desc: 'Battered paneer cubes, deep-fried to perfection',
    emoji: '🧀', veg: true, bestSeller: false, spicy: false
  },

  // ── Sides ──────────────────────────────────────────────────────────────
  {
    id: 60, category: 'Sides', name: 'Boondi Raita', price: 79,
    desc: 'Chilled yogurt with crispy boondi & cumin',
    emoji: '🥣', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 61, category: 'Sides', name: 'Onion Raita', price: 69,
    desc: 'Creamy yogurt with crunchy onion & coriander',
    emoji: '🥣', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 62, category: 'Sides', name: 'Chaas', price: 49,
    desc: 'Chilled spiced buttermilk with cumin & mint',
    emoji: '🥛', veg: true, bestSeller: false, spicy: false
  },
  {
    id: 63, category: 'Sides', name: 'Lassi', price: 79,
    desc: 'Thick creamy sweet yogurt drink',
    emoji: '🥛', veg: true, bestSeller: false, spicy: false
  }
];

const CATEGORIES = [];

const DELIVERY_ZONES = {
  '560024': 'Hebbal',
  '560064': 'Yelahanka',
  '560080': 'Sadashivanagar',
  '560032': 'RT Nagar',
  '560054': 'Mathikere',
  '560013': 'Jalahalli',
  '560022': 'Yeshwanthpur',
  '560003': 'Malleshwaram',
  '560010': 'Rajajinagar',
  '560045': 'Nagawara'
};

// ── Cart state ────────────────────────────────────────────────────────────────
// Each cart entry: { id, name, price, emoji, image_url, qty, addonsByUnit: [[{name,price}], ...] }
// addonsByUnit[i] holds the selected addons for unit i (length === qty)
let cart = (function _loadCart() {
  const raw = JSON.parse(localStorage.getItem('ok_cart') || '[]');
  // Migrate old format: selectedAddons → addonsByUnit
  return raw.map(item => {
    if (!Array.isArray(item.addonsByUnit)) {
      const legacy = Array.isArray(item.selectedAddons) ? item.selectedAddons : [];
      item.addonsByUnit = Array.from({ length: item.qty || 1 }, (_, i) => i === 0 ? legacy : []);
      delete item.selectedAddons;
    }
    return item;
  });
})();

// Applied coupon state
let _appliedCoupon = null; // { code, discount_type, discount_value, min_order, max_discount }

function saveCart() {
  localStorage.setItem('ok_cart', JSON.stringify(cart));
  updateCartUI();
  // Re-render menu cards (ADD → qty controls) if on menu page
  if (typeof renderMenu === 'function') renderMenu();
  // Re-render checkout items list if on checkout page
  if (typeof renderCheckoutItems === 'function') renderCheckoutItems();
}

function addToCart(itemId, qty = 1) {
  const item = MENU_DATA.find(i => i.id === itemId);
  if (!item) return;
  const existing = cart.find(c => c.id === itemId);
  if (existing) {
    // Add empty addon slots for newly added units
    for (let i = 0; i < qty; i++) existing.addonsByUnit.push([]);
    existing.qty += qty;
  } else {
    cart.push({
      id: item.id, name: item.name, price: item.price,
      emoji: item.emoji, image_url: item.image_url || null,
      qty,
      addonsByUnit: Array.from({ length: qty }, () => [])
    });
  }
  saveCart();
  showToast(`${item.emoji} ${item.name} added to cart`);
}

function removeFromCart(itemId) {
  cart = cart.filter(c => c.id !== itemId);
  saveCart();
}

function updateQty(itemId, delta) {
  const existing = cart.find(c => c.id === itemId);
  if (!existing) return;
  if (delta > 0) {
    // Push empty addon slots for new units
    for (let i = 0; i < delta; i++) existing.addonsByUnit.push([]);
  } else if (delta < 0) {
    // Remove addon slots from the end (abs(delta) units removed)
    existing.addonsByUnit.splice(delta);
  }
  existing.qty = Math.max(0, existing.qty + delta);
  // Ensure addonsByUnit length always matches qty
  existing.addonsByUnit = existing.addonsByUnit.slice(0, existing.qty);
  if (existing.qty === 0) removeFromCart(itemId);
  else saveCart();
}

function getItemLineTotal(cartEntry) {
  // Sum each unit's price + its own addons
  return (cartEntry.addonsByUnit || [[]]).reduce((sum, unitAddons) => {
    const extra = (unitAddons || []).reduce((s, a) => s + (a.price || 0), 0);
    return sum + cartEntry.price + extra;
  }, 0);
}

function getCartSubtotal() {
  return cart.reduce((sum, c) => sum + getItemLineTotal(c), 0);
}

function getCartDiscount(subtotal) {
  if (!_appliedCoupon) return 0;
  const c = _appliedCoupon;
  if (subtotal < (c.min_order || 0)) return 0;
  let disc = c.discount_type === 'flat'
    ? c.discount_value
    : Math.round(subtotal * c.discount_value / 100);
  if (c.max_discount) disc = Math.min(disc, c.max_discount);
  return disc;
}

function getCartTotal() {
  const sub = getCartSubtotal();
  return Math.max(0, sub - getCartDiscount(sub));
}

function getCartCount() {
  return cart.reduce((sum, c) => sum + c.qty, 0);
}

function updateCartUI() {
  const count   = getCartCount();
  const sub     = getCartSubtotal();
  const disc    = getCartDiscount(sub);
  const total   = Math.max(0, sub - disc);

  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent = count;
    el.style.display = count > 0 ? 'flex' : 'none';
  });
  document.querySelectorAll('.cart-total-amount').forEach(el => el.textContent = `₹${total}`);

  const subEl = document.getElementById('cartSubtotal');
  if (subEl) subEl.textContent = `₹${sub}`;

  const discRow = document.getElementById('cartDiscountRow');
  const discAmt = document.getElementById('cartDiscountAmt');
  const discLbl = document.getElementById('cartDiscountLabel');
  if (discRow) {
    discRow.style.display = (disc > 0) ? 'flex' : 'none';
    if (discAmt) discAmt.textContent = `−₹${disc}`;
    if (discLbl && _appliedCoupon) discLbl.textContent = `Discount (${_appliedCoupon.code})`;
  }

  // Sync location label in cart top bar
  const locEl = document.getElementById('cartLocLabel');
  if (locEl) {
    const loc = (typeof getCurrentLocation === 'function') ? getCurrentLocation() : null;
    locEl.textContent = loc?.shortName || 'Set delivery location';
  }

  renderCartItems();
}

function renderCartItems() {
  const container = document.querySelector('.cart-items');
  if (!container) return;
  if (cart.length === 0) {
    container.innerHTML = `
      <div class="empty-cart">
        <div class="empty-icon">🛒</div>
        <p style="margin:8px 0 4px;font-weight:700;color:var(--text-dark);">Your plate is empty!</p>
        <p style="font-size:13px;color:var(--text-light);margin-bottom:16px;">Add some delicious dishes to get started</p>
        <button class="btn btn-primary btn-sm" onclick="closeCart();document.getElementById('menu')?.scrollIntoView({behavior:'smooth'})">
          Browse Menu 🍽️
        </button>
      </div>`;
    return;
  }

  container.innerHTML = cart.map(item => {
    const lineTotal = getItemLineTotal(item);
    const menuItem  = MENU_DATA.find(m => m.id === item.id);
    const hasAddons = menuItem?.addons?.length > 0;
    const units = item.addonsByUnit || [[]];

    // Build per-unit customize rows (only if has addons)
    const customizeRows = hasAddons ? units.map((unitAddons, idx) => {
      const label = unitAddons.length ? `✏️ ${unitAddons.map(a => a.name).join(', ')}` : '+ Customize';
      const unitLabel = item.qty > 1 ? `<span style="font-size:10px;color:var(--text-light);margin-right:4px;">Unit ${idx+1}:</span>` : '';
      return `<div style="margin-bottom:2px;">${unitLabel}<button class="cart-customize-btn" onclick="openAddonModal(${item.id}, ${idx})">${label}</button></div>`;
    }).join('') : '';

    return `
    <div class="cart-item" id="cart-item-${item.id}">
      <div class="cart-item-img">
        ${item.image_url
          ? `<img src="${item.image_url}" alt="${item.name}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;border-radius:8px;"/>`
          : `<span style="font-size:26px;">${item.emoji}</span>`}
      </div>
      <div class="cart-item-body">
        <div class="cart-item-name">${item.name}</div>
        ${customizeRows}
        <div class="cart-item-price-row">
          <div class="qty-control">
            <button class="qty-btn" onclick="updateQty(${item.id}, -1)">−</button>
            <span class="qty-num">${item.qty}</span>
            <button class="qty-btn" onclick="updateQty(${item.id}, 1)">+</button>
          </div>
          <div class="cart-item-total">₹${lineTotal}</div>
        </div>
      </div>
    </div>`;
  }).join('') +
  `<button class="cart-add-more-btn" onclick="closeCart();setTimeout(()=>document.getElementById('menu')?.scrollIntoView({behavior:'smooth'}),300)">
    + Add more items
  </button>`;
}

// Toast
function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// Cart: navigate directly to checkout page
function openCart() {
  window.location.href = '/checkout';
}
function closeCart() {
  // no-op — kept for compatibility
}

// ── Add-ons customize modal ───────────────────────────────────────────────────
let _addonModalItemId  = null;
let _addonModalUnitIdx = 0;   // which unit (0-based) is being customized

function openAddonModal(itemId, unitIdx = 0) {
  const menuItem = MENU_DATA.find(m => m.id === itemId);
  const cartItem = cart.find(c => c.id === itemId);
  if (!menuItem || !cartItem) return;
  _addonModalItemId  = itemId;
  _addonModalUnitIdx = unitIdx;

  // Title shows unit number only when qty > 1
  const unitSuffix = cartItem.qty > 1 ? ` — Unit ${unitIdx + 1}` : '';
  document.getElementById('addonModalTitle').textContent = menuItem.name + unitSuffix;

  const addons   = Array.isArray(menuItem.addons) ? menuItem.addons.filter(a => a.name) : [];
  const selected = (cartItem.addonsByUnit || [])[unitIdx] || [];

  document.getElementById('addonModalItems').innerHTML = addons.length
    ? addons.map((a, i) => {
        const checked = selected.some(s => s.name === a.name);
        return `<label class="addon-modal-row">
          <div class="addon-modal-row-left">
            <input type="checkbox" id="am-addon-${i}" ${checked ? 'checked' : ''}
              onchange="_updateAddonModalTotal()" style="width:18px;height:18px;accent-color:var(--rust);flex-shrink:0;"/>
            <span>${a.name}</span>
          </div>
          <span class="addon-modal-price">+₹${a.price || 0}</span>
        </label>`;
      }).join('')
    : '<p style="padding:16px;color:var(--text-light);font-size:13px;text-align:center;">No add-ons available</p>';

  _updateAddonModalTotal();
  document.getElementById('addonModalOverlay').classList.add('open');
  document.getElementById('addonModal').classList.add('open');
}

function _updateAddonModalTotal() {
  const menuItem = MENU_DATA.find(m => m.id === _addonModalItemId);
  if (!menuItem) return;
  const addons = Array.isArray(menuItem.addons) ? menuItem.addons.filter(a => a.name) : [];
  let extra = 0;
  addons.forEach((a, i) => {
    if (document.getElementById(`am-addon-${i}`)?.checked) extra += (a.price || 0);
  });
  const el = document.getElementById('addonModalTotal');
  if (el) el.textContent = `₹${menuItem.price + extra}`;
}

function confirmAddonModal() {
  const menuItem = MENU_DATA.find(m => m.id === _addonModalItemId);
  const cartItem = cart.find(c => c.id === _addonModalItemId);
  if (!menuItem || !cartItem) return;
  const addons = Array.isArray(menuItem.addons) ? menuItem.addons.filter(a => a.name) : [];
  // Ensure addonsByUnit has enough slots
  if (!Array.isArray(cartItem.addonsByUnit)) cartItem.addonsByUnit = Array.from({ length: cartItem.qty }, () => []);
  while (cartItem.addonsByUnit.length < cartItem.qty) cartItem.addonsByUnit.push([]);
  cartItem.addonsByUnit[_addonModalUnitIdx] = addons.filter((a, i) => document.getElementById(`am-addon-${i}`)?.checked);
  saveCart();
  closeAddonModal();
}

function closeAddonModal() {
  document.getElementById('addonModalOverlay')?.classList.remove('open');
  document.getElementById('addonModal')?.classList.remove('open');
  _addonModalItemId = null;
}

// ── Coupon / Offers sheet ─────────────────────────────────────────────────────
async function applyCoupon() {
  const code = document.getElementById('couponInput')?.value.trim().toUpperCase();
  const msg  = document.getElementById('couponMsg');
  if (!code) { if (msg) msg.innerHTML = '<span style="color:#C62828;">Enter a coupon code first.</span>'; return; }
  try {
    const { offers } = await fetch('/api/offers').then(r => r.json());
    const offer = offers.find(o => o.code === code);
    if (!offer) {
      _appliedCoupon = null;
      if (msg) msg.innerHTML = `<span style="color:#C62828;">❌ "${code}" is not a valid coupon.</span>`;
    } else {
      const sub = getCartSubtotal();
      if (sub < (offer.min_order || 0)) {
        if (msg) msg.innerHTML = `<span style="color:#C62828;">❌ Minimum order ₹${offer.min_order} required.</span>`;
        return;
      }
      _appliedCoupon = offer;
      updateCartUI();
      if (msg) msg.innerHTML = `<span style="color:#2E7D32;">✅ "${code}" applied!</span>`;
    }
  } catch {
    if (msg) msg.innerHTML = `<span style="color:#C62828;">Could not validate coupon. Try again.</span>`;
  }
}

async function openOffersSheet() {
  document.getElementById('offersSheetOverlay')?.classList.add('open');
  document.getElementById('offersSheetPanel')?.classList.add('open');
  const list = document.getElementById('offersSheetList');
  if (!list) return;
  list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-light);font-size:13px;">Loading offers…</div>';
  try {
    const { offers } = await fetch('/api/offers').then(r => r.json());
    if (!offers.length) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-light);font-size:13px;">No offers available right now.</div>';
      return;
    }
    list.innerHTML = offers.map(o => {
      const discText = o.discount_type === 'flat' ? `₹${o.discount_value} off` : `${o.discount_value}% off`;
      const minText  = o.min_order ? ` on orders above ₹${o.min_order}` : '';
      return `<div class="offer-list-card">
        <div class="offer-list-card-top">
          <span class="offer-list-code">${o.code}</span>
          <button class="offer-list-apply-btn" onclick="applyOfferCode('${o.code}')">Apply</button>
        </div>
        <div class="offer-list-title">${o.title}</div>
        <div class="offer-list-desc">${discText}${minText}${o.max_discount ? ` (max ₹${o.max_discount})` : ''}</div>
      </div>`;
    }).join('');
  } catch {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#C62828;font-size:13px;">Failed to load offers.</div>';
  }
}

function applyOfferCode(code) {
  const input = document.getElementById('couponInput');
  if (input) input.value = code;
  closeOffersSheet();
  applyCoupon();
}

function closeOffersSheet() {
  document.getElementById('offersSheetOverlay')?.classList.remove('open');
  document.getElementById('offersSheetPanel')?.classList.remove('open');
}

// ── Proceed to checkout (auth-gated) ─────────────────────────────────────────
function proceedToCheckout() {
  if (cart.length === 0) { showToast('Add items to your cart first!'); return; }
  if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
    closeCart();
    showToast('Please sign in to place your order');
    setTimeout(() => { if (typeof openAuthSheet === 'function') openAuthSheet(); }, 300);
    return;
  }
  window.location.href = '/checkout';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  updateCartUI();
  document.querySelector('.cart-overlay')?.addEventListener('click', closeCart);
  // Load live menu from DB via API
  _loadMenuFromAPI();
});