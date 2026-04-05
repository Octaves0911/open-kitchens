/**
 * One-time script: convert all existing menu/offer/hero images to
 * optimised WebP files and update the SQLite DB image_url records.
 *
 * Run:  node scripts/convert-images.js
 */
const path  = require('path');
const fs    = require('fs');
const sharp = require('sharp');
const db    = require('../db/database');

const IMG_DIR = path.join(__dirname, '..', 'public', 'images');

// Resize targets (px) — keeps aspect ratio, crops to cover
const TARGETS = {
  menu:   { width: 400, height: 300 },   // menu card thumbnails
  offers: { width: 800, height: 400 },   // offer banners
  root:   { width: null, height: null }, // logo / hero — just re-encode
};

async function convertFile(srcPath, destPath, opts) {
  let pipeline = sharp(srcPath).webp({ quality: 78, effort: 4 });
  if (opts.width && opts.height) {
    pipeline = sharp(srcPath)
      .resize(opts.width, opts.height, { fit: 'cover', position: 'centre' })
      .webp({ quality: 78, effort: 4 });
  }
  await pipeline.toFile(destPath);
  const before = fs.statSync(srcPath).size;
  const after  = fs.statSync(destPath).size;
  console.log(`  ✓ ${path.basename(srcPath)} → ${path.basename(destPath)} (${kb(before)} → ${kb(after)}, −${pct(before,after)}%)`);
  return destPath;
}

function kb(b)  { return Math.round(b / 1024) + 'KB'; }
function pct(b, a) { return Math.round((1 - a / b) * 100); }

async function processDir(subDir, opts) {
  const dir = path.join(IMG_DIR, subDir);
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => /\.(jpe?g|png|gif)$/i.test(f));
  for (const file of files) {
    const src  = path.join(dir, file);
    const dest = path.join(dir, file.replace(/\.(jpe?g|png|gif)$/i, '.webp'));
    if (fs.existsSync(dest)) {
      console.log(`  ⏭  ${file} already converted`);
      continue;
    }
    await convertFile(src, dest, opts);
  }
}

async function updateDb() {
  // Update menu_items table — replace image_url extensions
  const items = db.prepare(`SELECT id, image_url FROM menu_items WHERE image_url IS NOT NULL`).all();
  const stmtM = db.prepare(`UPDATE menu_items SET image_url=? WHERE id=?`);
  let updated = 0;
  for (const item of items) {
    const newUrl = item.image_url.replace(/\.(jpe?g|png|gif)$/i, '.webp');
    if (newUrl !== item.image_url) {
      // Only update if the webp file actually exists on disk
      const filePath = path.join(__dirname, '..', 'public', newUrl);
      if (fs.existsSync(filePath)) {
        stmtM.run(newUrl, item.id);
        updated++;
      }
    }
  }
  console.log(`  DB menu_items updated: ${updated} rows`);

  // Update offers table
  const offers = db.prepare(`SELECT id, image_url FROM offers WHERE image_url IS NOT NULL`).all();
  const stmtO  = db.prepare(`UPDATE offers SET image_url=? WHERE id=?`);
  let updatedO = 0;
  for (const o of offers) {
    const newUrl = o.image_url.replace(/\.(jpe?g|png|gif)$/i, '.webp');
    if (newUrl !== o.image_url) {
      const filePath = path.join(__dirname, '..', 'public', newUrl);
      if (fs.existsSync(filePath)) {
        stmtO.run(newUrl, o.id);
        updatedO++;
      }
    }
  }
  console.log(`  DB offers updated: ${updatedO} rows`);
}

(async () => {
  console.log('🖼  Converting images to WebP…\n');

  console.log('→ Menu images');
  await processDir('menu', TARGETS.menu);

  console.log('\n→ Offer images');
  await processDir('offers', TARGETS.offers);

  console.log('\n→ Root images (hero, logo)');
  // Hero background only — skip logo (PNG with transparency)
  const hero = path.join(IMG_DIR, 'hero-background.jpg');
  if (fs.existsSync(hero) && !fs.existsSync(hero.replace('.jpg', '.webp'))) {
    await convertFile(hero, hero.replace('.jpg', '.webp'), { width: 1200, height: null });
  }

  console.log('\n→ Updating database URLs');
  await updateDb();

  console.log('\n✅  Done! Restart the server to serve fresh images.');
})();
