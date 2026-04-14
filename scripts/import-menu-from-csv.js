/**
 * Import menu items from Final Menu.csv into SQLite.
 *
 * - Replaces all menu items for restaurant_id=1
 * - Leaves image_url NULL (can be updated later)
 *
 * Usage:
 *   node scripts/import-menu-from-csv.js "Final Menu.csv"
 */
const fs = require('fs');
const path = require('path');

const db = require('../db/database');

function parseCsv(text) {
  // Minimal RFC4180-ish parser supporting quoted fields + commas + newlines.
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    // Skip completely empty trailing row
    if (row.length === 1 && row[0] === '') return;
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        // Escaped quote
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (c === '\n') {
      pushField();
      pushRow();
      i += 1;
      continue;
    }
    if (c === '\r') {
      // swallow CR (Windows newlines)
      i += 1;
      continue;
    }

    field += c;
    i += 1;
  }

  // last field / row
  pushField();
  if (row.length) pushRow();

  return rows;
}

function toBoolVeg(tag) {
  const t = String(tag || '').trim().toLowerCase();
  if (!t) return 1;
  if (t.includes('non')) return 0;
  // treat egg as non-veg for badge purposes
  if (t.includes('egg')) return 0;
  return 1;
}

function normalizeAddonList(raw) {
  const s = String(raw || '').trim();
  if (!s || s === '-' || s.toLowerCase() === 'na') return [];
  // Split by | or , as best effort
  const parts = s.includes('|') ? s.split('|') : s.split(',');
  return parts.map(p => p.trim()).filter(Boolean);
}

function normalizeAddonPrices(raw) {
  const s = String(raw || '').trim();
  if (!s || s === '-' || s.toLowerCase() === 'na') return [];
  const parts = s.includes('|') ? s.split('|') : s.split(',');
  return parts.map(p => {
    const n = Number(String(p).trim());
    return Number.isFinite(n) ? n : 0;
  });
}

function buildAddonsJson(addOns, addOnPrices) {
  const names = normalizeAddonList(addOns);
  const prices = normalizeAddonPrices(addOnPrices);
  if (!names.length) return '[]';
  const arr = names.map((name, idx) => ({ name, price: prices[idx] ?? 0 }));
  return JSON.stringify(arr);
}

function main() {
  const inputArg = process.argv[2] || 'Final Menu.csv';
  const csvPath = path.isAbsolute(inputArg) ? inputArg : path.join(__dirname, '..', inputArg);
  const text = fs.readFileSync(csvPath, 'utf8');

  const rows = parseCsv(text);
  if (!rows.length) throw new Error('CSV appears empty');

  const header = rows[0].map(h => String(h || '').trim());
  const idx = (name) => header.indexOf(name);

  const required = [
    'Item name',
    'Category',
    'Item price',
    'Dietary Tag (veg/non veg/egg)',
    'Item description',
    'Add Ons',
    'Add on Prices',
    'Serving Size',
    'Subcategory',
    'Item Type (Goods / Services)',
    'Variant',
    'Variant Price',
  ];
  for (const col of required) {
    if (idx(col) === -1) throw new Error(`Missing required column: ${col}`);
  }

  const RESTAURANT_ID = 1;

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM menu_items WHERE restaurant_id=?').run(RESTAURANT_ID);

    const insert = db.prepare(`
      INSERT INTO menu_items
        (restaurant_id, name, category, description, price, image_url,
         is_veg, is_available, is_bestseller, is_spicy,
         addons_json, metadata_json, sort_order)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    let sort = 0;
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const name = String(row[idx('Item name')] || '').trim();
      if (!name) continue;

      const category = String(row[idx('Category')] || '').trim() || null;
      const description = String(row[idx('Item description')] || '').trim() || null;
      const price = Number(String(row[idx('Item price')] || '').trim());
      const isVeg = toBoolVeg(row[idx('Dietary Tag (veg/non veg/egg)')]);
      const addonsJson = buildAddonsJson(row[idx('Add Ons')], row[idx('Add on Prices')]);

      const metadata = {
        serving_size: String(row[idx('Serving Size')] || '').trim() || null,
        subcategory: String(row[idx('Subcategory')] || '').trim() || null,
        item_type: String(row[idx('Item Type (Goods / Services)')] || '').trim() || null,
        variant: String(row[idx('Variant')] || '').trim() || null,
        variant_price: String(row[idx('Variant Price')] || '').trim() || null,
      };

      insert.run(
        RESTAURANT_ID,
        name,
        category,
        description,
        Number.isFinite(price) ? price : 0,
        null,              // image_url left empty for now
        isVeg,
        1,                 // is_available
        0,                 // is_bestseller
        0,                 // is_spicy
        addonsJson,
        JSON.stringify(metadata),
        sort++
      );
    }
  });

  tx();

  const count = db.prepare('SELECT count(*) as n FROM menu_items WHERE restaurant_id=?').get(RESTAURANT_ID);
  console.log(`Imported ${count.n} menu items for restaurant_id=${RESTAURANT_ID} from ${path.basename(csvPath)}`);
}

main();

