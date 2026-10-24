import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const root = new URL('../public/images/ai-match/portraits/', import.meta.url);
const { portraits, scope } = JSON.parse(await readFile(new URL('catalogue.json', root), 'utf8'));
assert.equal(portraits.length, 144);
const hashes = new Set();
let totalBytes = 0;
for (const portrait of portraits) {
  const bytes = await readFile(new URL(portrait.file, root));
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, 'webp', portrait.file);
  // Cards show portraits at most ~380 CSS px wide, so 900 px stays sharp on 2x screens.
  assert.ok(metadata.width >= 800 && metadata.height >= 500, portrait.file + ': resolution');
  assert.ok(metadata.width / metadata.height >= 1.4 && metadata.width / metadata.height <= 1.8, portrait.file + ': landscape framing');
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.ok(!hashes.has(hash), portrait.file + ': duplicate image');
  hashes.add(hash);
  totalBytes += bytes.length;
}
await mkdir(new URL('../output/ai-match/', import.meta.url), { recursive: true });
await writeFile(new URL('../output/ai-match/verification.json', import.meta.url), JSON.stringify({
  scope, images: portraits.length, uniqueImages: hashes.size, totalBytes,
  format: 'webp', valid: true,
}, null, 2));
console.log(`Verified ${portraits.length} distinct landscape WebP portraits, ${(totalBytes / 1048576).toFixed(1)} MB total.`);
