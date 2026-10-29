// Font size and WCAG contrast of the text inside the home hero search card.
// Usage: node scripts/audit-hero-text.mjs [baseUrl]
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:3098';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport });
  await page.goto(`${base}/main?lang=en`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const rows = await page.evaluate(() => {
    const rgb = (value) => (value.match(/[\d.]+/g) || []).map(Number);
    const lum = ([r, g, b]) => {
      const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const background = (el) => {
      for (let node = el; node; node = node.parentElement) {
        const c = rgb(getComputedStyle(node).backgroundColor);
        if (c.length >= 3 && (c[3] ?? 1) > 0.5) return c;
      }
      return [255, 255, 255];
    };
    const card = document.querySelector('.search-fields')?.closest('form, section, div');
    const out = [];
    const check = (el, text, color) => {
      const style = getComputedStyle(el);
      const fg = rgb(color || style.color);
      const bg = background(el);
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      out.push(`${parseFloat(style.fontSize).toFixed(1)}px  ${((a + 0.05) / (b + 0.05)).toFixed(2)}:1  ${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}  "${text.slice(0, 30)}"`);
    };
    for (const el of card.querySelectorAll('*')) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ');
      if (own && el.getBoundingClientRect().width) check(el, own);
      if (el.placeholder) check(el, `[placeholder] ${el.placeholder}`, getComputedStyle(el, '::placeholder').color);
    }
    return out;
  });
  console.log(`\n== ${viewport.width}px`);
  for (const row of [...new Set(rows)]) console.log(row);
  await page.close();
}
await browser.close();
