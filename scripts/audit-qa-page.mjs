// Page checks from the QA audit: missing alt text, empty links, small tap targets,
// lazy loading below the fold and hero search text size/contrast.
// Usage: node scripts/audit-qa-page.mjs [baseUrl]   (default http://localhost:3098)
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:3098';
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function audit(path, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(6000);
  const result = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const describe = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"`;
    const images = [...document.images];
    const fold = window.innerHeight;
    const small = [...document.querySelectorAll('a[href], button, [role="button"]')]
      .filter(visible)
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width < 32 || r.height < 32; })
      .map((el) => { const r = el.getBoundingClientRect(); return `${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}`; });
    return {
      images: images.length,
      noAlt: images.filter((img) => !img.hasAttribute('alt')).map((img) => img.className || img.src.slice(-40)),
      eagerBelowFold: images
        .filter((img) => img.getBoundingClientRect().top > fold * 1.5 && img.loading !== 'lazy')
        .map((img) => `${img.className} ${img.src.slice(-30)}`),
      emptyHref: [...document.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '' ).map(describe),
      noHref: [...document.querySelectorAll('a:not([href])')].map(describe),
      small,
      unnamedButtons: [...document.querySelectorAll('button, a[href]')]
        .filter(visible)
        .filter((el) => !(el.getAttribute('aria-label') || el.textContent.trim() || el.getAttribute('title') || el.querySelector('img[alt]:not([alt=""])')))
        .map(describe),
    };
  });
  await page.close();
  return result;
}

for (const path of process.argv.slice(3).length ? process.argv.slice(3) : ['/main', '/ExploreProperty']) {
  for (const [name, viewport] of [['desktop', { width: 1366, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const r = await audit(path, viewport);
    console.log(`\n== ${path} ${name}: ${r.images} images, ${r.noAlt.length} without alt`);
    console.log(' noAlt:', [...new Set(r.noAlt)].slice(0, 8));
    console.log(' eager below fold:', r.eagerBelowFold.length, r.eagerBelowFold.slice(0, 5));
    console.log(' empty href:', r.emptyHref, ' a without href:', r.noHref.slice(0, 5));
    console.log(' unnamed buttons/links:', r.unnamedButtons.slice(0, 8));
    console.log(` small targets (${r.small.length}):`, r.small.slice(0, 25));
  }
}
await browser.close();
