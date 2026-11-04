// Serves dist/site/browser and drives the offer modal and CRM page against intercepted API responses.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = 'dist/site/browser';
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split('?')[0]));
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(200, { 'content-type': 'text/html' }).end(await readFile(join(root, 'index.html')));
  }
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir('tmp/offer-ui', { recursive: true });

const profile = { propertyGoal: 'Rent', districts: ['Vake', 'Saburtalo'], locationFlexible: false, budgetMin: 900, budgetMax: 1200, currency: 'USD', adults: 2, children: 0, bedrooms: 2, bedroomChoices: [2], minSize: 65, hasPet: true, petTypes: ['Dog'], petType: 'Dog', dogSize: 'Small', petCount: 1, moveInTiming: 'Flexible', rentalDuration: 'TwelveMonths', topPriorities: ['Workspace'] };
const board = { items: [{ id: 1042, identityVerified: false, nationality: 'Georgia', profile, agent: { name: 'Test Agent', phone: '+995555999888', photo: null } }], total: 1, page: 1, pageSize: 12 };
const listings = [
  { id: 7, title: 'Vake two bedroom', district: 'Vake', price: 1000, images: [] },
  { id: 8, title: 'Saburtalo flat', district: 'Saburtalo', price: 1100, images: [] },
];
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = (role) => `${b64({ alg: 'none' })}.${b64({ sub: 'u1', role, exp: 4102444800 })}.x`;
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const browser = await chromium.launch(process.env.OFFER_UI_CHROMIUM ? { executablePath: process.env.OFFER_UI_CHROMIUM } : { channel: 'chrome' });

async function open({ width, height, language = 'ka', role = 'Client', mine = listings, boardPage = board, respond }) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript(({ token, language, role }) => {
    try {
      localStorage.setItem('velven-language', language);
      if (token) { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify({ id: 'u1', fullName: 'Test', roles: [role], role })); }
    } catch {}
  }, { token: role ? token(role) : null, language, role });
  const page = await context.newPage();
  const posts = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/client-board') return route.fulfill({ json: boardPage });
    if (url.pathname.endsWith('/mine')) return route.fulfill({ json: mine });
    if (url.pathname === '/api/apartment-offers' && route.request().method() === 'POST') {
      posts.push(route.request().postDataJSON());
      await new Promise((resolve) => setTimeout(resolve, 300));
      return respond ? route.fulfill(respond) : route.fulfill({ json: { id: 1, status: 'pending' } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto(`${base}/clients`);
  await page.locator('.cc-offer').first().click();
  await page.locator('.offer-dialog').waitFor();
  return { page, posts, context };
}

for (const [width, height] of [[320, 568], [375, 667], [430, 932], [768, 1024], [1280, 800], [1920, 1080]]) {
  const { page, posts, context } = await open({ width, height });
  const box = await page.locator('.offer-dialog').boundingBox();
  ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height + 1, `dialog fits ${width}x${height}`);
  ok(await page.locator('.offer-foot').isVisible(), 'footer visible');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page scroll');
  const scroller = page.locator('.offer-scroll');
  await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  ok(await page.locator('.offer-security').evaluate((el) => { const r = el.getBoundingClientRect(); const f = document.querySelector('.offer-foot').getBoundingClientRect(); return r.bottom <= f.top + 1; }), 'content scrolls clear of footer');
  await page.screenshot({ path: `tmp/offer-ui/modal-${width}.png` });
  ok((await page.locator('.offer-share').innerText()).includes('შესთავაზეთ სხვა შესაბამის კლიენტებსაც'), 'Georgian share label');
  await page.locator('.offer-send').click();
  await page.locator('.offer-error').waitFor({ timeout: 3000 });
  ok(posts.length === 0, 'validation before sending');
  await page.locator('.offer-options input').first().check();
  await page.locator('.offer-send').click({ clickCount: 3, force: true }).catch(() => undefined);
  await page.locator('.offer-success').waitFor();
  assert.deepEqual(posts, [{ clientId: 1042, apartmentId: 7, shareWithOtherClients: true }]); checks++;
  await context.close();
}

{ const { page, posts, context } = await open({ width: 1280, height: 800, mine: [listings[0]] });
  ok(await page.locator('.offer-options input').isChecked(), 'single listing preselected');
  await page.locator('.offer-share input').uncheck();
  await page.locator('.offer-send').click();
  await page.locator('.offer-success').waitFor();
  assert.equal(posts[0].shareWithOtherClients, false); checks++;
  await context.close(); }
{ const { page, context } = await open({ width: 1280, height: 800, mine: [listings[0]], respond: { status: 409, json: { code: 'already_offered' } } });
  await page.locator('.offer-send').click();
  await page.locator('.offer-error').waitFor();
  ok((await page.locator('.offer-send').isEnabled()), 'retry possible after error');
  await context.close(); }
{ const { page, context } = await open({ width: 1280, height: 800, mine: [] });
  ok(await page.locator('.offer-send').isDisabled() && await page.locator('a.offer-link').isVisible(), 'no listings: upload link');
  await context.close(); }
{ const { page, context } = await open({ width: 1280, height: 800, role: null });
  ok(await page.locator('.offer-send').isDisabled() && await page.locator('button.offer-link').isVisible(), 'signed out: sign in');
  await context.close(); }
{ const { page, context } = await open({ width: 1280, height: 800, boardPage: { items: [], total: 0, page: 1, pageSize: 12 } });
  ok(await page.locator('.offer-send').isDisabled(), 'example profile cannot send');
  await page.keyboard.press('Escape');
  await page.locator('.offer-dialog').waitFor({ state: 'detached' });
  ok(await page.evaluate(() => getComputedStyle(document.body).overflow !== 'hidden'), 'scroll restored after close');
  await context.close(); }

{ // CRM review page and bell link target.
  const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
  await context.addInitScript((value) => { localStorage.setItem('velven-language', 'en'); localStorage.setItem('token', value); localStorage.setItem('user', JSON.stringify({ id: 'a1', fullName: 'Agent', roles: ['Agent'], role: 'Agent', isAgent: true })); }, token('Agent'));
  const page = await context.newPage();
  const review = { id: 5, clientId: 1042, status: 'pending', shareWithOtherClients: true, createdAt: '2026-11-04T10:00:00Z', reviewedAt: null, isNew: true, submitter: { name: 'Owner', phone: '+995555111222' }, matchedClientIds: [], apartment: { id: 7, title: 'Vake two bedroom', price: 1000, district: 'Vake', street: '', bedrooms: 2, sizeSquareMeters: 80, isApproved: false, imageUrl: null } };
  const calls = [];
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') calls.push(path);
    if (path === '/api/apartment-offers') return route.fulfill({ json: [review] });
    if (path.endsWith('/approve')) return route.fulfill({ json: { status: 'approved', matchedClients: 3 } });
    return route.fulfill({ json: [] });
  });
  await page.goto(`${base}/crm/apartment-offers?offer=5`);
  await page.locator('.offer.focused').waitFor();
  ok((await page.locator('.offer.focused').innerText()).includes('Sharing with other clients: on'), 'review shows sharing');
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.locator('.notice').waitFor();
  ok((await page.locator('.notice').innerText()).includes('3'), 'approval shows matched count');
  ok(calls.includes('/api/apartment-offers/5/approve') && calls.some((c) => c.endsWith('/apartment-offer/5/read')), 'approve and read calls sent');
  await context.close(); }

console.log(`Offer UI: ${checks} checks passed`);
await browser.close();
server.close();
