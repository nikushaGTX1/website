import { readFile, access, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
const root = new URL('../public/images/ai-match/portraits/', import.meta.url);
const { portraits } = JSON.parse(await readFile(new URL('catalogue.json', root), 'utf8'));
const output = new URL('../output/ai-match/', import.meta.url);
await mkdir(output, { recursive: true });
for (const layout of [...new Set(portraits.map((p) => p.layout))]) {
  const items = portraits.filter((p) => p.layout === layout), tiles = [];
  let saved = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i], file = new URL(item.file, root), left = (i % 4) * 280, top = Math.floor(i / 4) * 208;
    try {
      await access(file);
      tiles.push({ input: await sharp(fileURL(file)).resize(280, 180, { fit: 'cover' }).png().toBuffer(), left, top });
      saved++;
    } catch { /* The labelled empty slot identifies a missing deliverable. */ }
    const caption = item.file.replace('.webp', '').replaceAll('--', ': ');
    tiles.push({ input: Buffer.from(`<svg width="280" height="28"><rect width="280" height="28" fill="#fff"/><text x="8" y="18" font-family="Arial" font-size="11" fill="#51345c">${caption}</text></svg>`), left, top: top + 180 });
  }
  await sharp({ create: { width: 1120, height: 832, channels: 3, background: '#e8deed' } }).composite(tiles).jpeg({ quality: 90 }).toFile(fileURL(new URL(`catalogue-${layout}.jpg`, output)));
  console.log(`${layout}: ${saved}/${items.length}`);
}
function fileURL(url) { return fileURLToPath(url); }
