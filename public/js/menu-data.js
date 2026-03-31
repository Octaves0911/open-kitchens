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
             <img src="${item.image_url}" alt="${item.name}" style="width:100%;height:100%;object-fit:cover;display:block;"/>
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

// Cart state
let cart = JSON.parse(localStorage.getItem('ok_cart') || '[]');

function saveCart() {
  localStorage.setItem('ok_cart', JSON.stringify(cart));
  updateCartUI();
}

function addToCart(itemId, qty = 1) {
  const item = MENU_DATA.find(i => i.id === itemId);
  if (!item) return;
  const existing = cart.find(c => c.id === itemId);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ id: item.id, name: item.name, price: item.price, emoji: item.emoji, qty });
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
  existing.qty = Math.max(0, existing.qty + delta);
  if (existing.qty === 0) removeFromCart(itemId);
  else saveCart();
}

function getCartTotal() {
  return cart.reduce((sum, c) => sum + c.price * c.qty, 0);
}

function getCartCount() {
  return cart.reduce((sum, c) => sum + c.qty, 0);
}

function updateCartUI() {
  const count = getCartCount();
  const total = getCartTotal();
  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent = count;
    el.style.display = count > 0 ? 'flex' : 'none';
  });
  document.querySelectorAll('.cart-total-amount').forEach(el => {
    el.textContent = `₹${total}`;
  });
  // Update cart items list if cart is open
  renderCartItems();
}

function renderCartItems() {
  const container = document.querySelector('.cart-items');
  if (!container) return;
  if (cart.length === 0) {
    container.innerHTML = `<div class="empty-cart">
      <div class="empty-icon">🛒</div>
      <p>Your cart is empty</p>
      <a href="/menu" class="btn btn-primary btn-sm" style="display:inline-flex;margin-top:12px;">Browse Menu</a>
    </div>`;
    return;
  }
  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <span style="font-size:24px">${item.emoji}</span>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">₹${item.price} × ${item.qty} = ₹${item.price * item.qty}</div>
      </div>
      <div class="qty-control">
        <button class="qty-btn" onclick="updateQty(${item.id}, -1)">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn" onclick="updateQty(${item.id}, 1)">+</button>
      </div>
    </div>
  `).join('');
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

// Cart sheet toggle
function openCart() {
  document.querySelector('.cart-overlay')?.classList.add('open');
  document.querySelector('.cart-sheet')?.classList.add('open');
  renderCartItems();
}
function closeCart() {
  document.querySelector('.cart-overlay')?.classList.remove('open');
  document.querySelector('.cart-sheet')?.classList.remove('open');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  updateCartUI();
  document.querySelector('.cart-overlay')?.addEventListener('click', closeCart);
  // Load live menu from DB via API
  _loadMenuFromAPI();
});
