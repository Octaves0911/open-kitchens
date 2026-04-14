/**
 * One-time migration: upload local menu/offer images to S3 and update DB URLs.
 *
 * Usage:
 *   AWS_REGION=ap-south-1 \
 *   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
 *   S3_BUCKET=your-bucket \
 *   S3_PUBLIC_BASE_URL=https://your-cdn.example.com \
 *   node scripts/migrate-images-to-s3.js
 */
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const db = require('../db/database');

const AWS_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || '';
const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL || '';

if (!AWS_REGION || !S3_BUCKET || !S3_PUBLIC_BASE_URL) {
  console.error('Missing required env vars: AWS_REGION, S3_BUCKET, S3_PUBLIC_BASE_URL');
  process.exit(1);
}

const s3 = new S3Client({ region: AWS_REGION });

function joinUrl(base, key) {
  const b = String(base || '').replace(/\/+$/, '');
  const k = String(key || '').replace(/^\/+/, '');
  return `${b}/${k}`;
}

async function putWebp({ key, buffer }) {
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return joinUrl(S3_PUBLIC_BASE_URL, key);
}

async function uploadDirToS3({ localDir, keyPrefix }) {
  if (!fs.existsSync(localDir)) return [];
  const files = fs.readdirSync(localDir).filter(f => /\.webp$/i.test(f));
  const uploaded = [];
  for (const filename of files) {
    const fullPath = path.join(localDir, filename);
    const buffer = fs.readFileSync(fullPath);
    const key = `${keyPrefix}/${filename}`;
    const url = await putWebp({ key, buffer });
    uploaded.push({ filename, key, url, localPath: fullPath });
    process.stdout.write(`Uploaded ${key}\n`);
  }
  return uploaded;
}

function updateMenuRowsToS3() {
  const rows = db.prepare(
    `SELECT id, image_url FROM menu_items
     WHERE image_url LIKE '/images/menu/%'`
  ).all();
  const stmt = db.prepare(`UPDATE menu_items SET image_url=? WHERE id=?`);
  let changed = 0;
  for (const r of rows) {
    const filename = String(r.image_url).split('/').pop();
    const nextUrl = joinUrl(S3_PUBLIC_BASE_URL, `menu/${filename}`);
    stmt.run(nextUrl, r.id);
    changed++;
  }
  return { scanned: rows.length, changed };
}

function updateOfferRowsToS3() {
  const rows = db.prepare(
    `SELECT id, image_url FROM offers
     WHERE image_url LIKE '/images/offers/%'`
  ).all();
  const stmt = db.prepare(`UPDATE offers SET image_url=? WHERE id=?`);
  let changed = 0;
  for (const r of rows) {
    const filename = String(r.image_url).split('/').pop();
    const nextUrl = joinUrl(S3_PUBLIC_BASE_URL, `offers/${filename}`);
    stmt.run(nextUrl, r.id);
    changed++;
  }
  return { scanned: rows.length, changed };
}

async function main() {
  const root = path.join(__dirname, '..');
  const menuDir = path.join(root, 'public', 'images', 'menu');
  const offersDir = path.join(root, 'public', 'images', 'offers');

  console.log('Uploading local WebP images to S3...');
  await uploadDirToS3({ localDir: menuDir, keyPrefix: 'menu' });
  await uploadDirToS3({ localDir: offersDir, keyPrefix: 'offers' });

  console.log('Updating DB image_url fields to S3 URLs...');
  const menu = updateMenuRowsToS3();
  const offers = updateOfferRowsToS3();

  console.log('Done.');
  console.log(JSON.stringify({ menu, offers }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

