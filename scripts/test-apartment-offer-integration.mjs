// Invoked by ApartmentOfferTests with an isolated PostgreSQL database and test-only HTTP host.
// Every /api request reaches the real controllers; no API responses are intercepted or mocked.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const fixture = JSON.parse(process.argv[2]);
assert.equal(new URL(fixture.api).hostname, '127.0.0.1', 'integration host must be local');
const root = resolve('dist/site/browser');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const headers = {};
      for (const key of ['content-type', 'x-test-role', 'x-test-user']) if (req.headers[key]) headers[key] = req.headers[key];
      const response = await fetch(`${fixture.api}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const body = Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status, { 'content-type': response.headers.get('content-type') || 'application/json' }).end(body);
      return;
    }
    const path = resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try { const body = await readFile(path); res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }).end(body); }
    catch { const body = await readFile(resolve(root, 'index.html')); res.writeHead(200, { 'content-type': 'text/html' }).end(body); }
  } catch (error) { res.writeHead(500).end(String(error)); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir('tmp/offer-integration', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
async function session(user, role, width = 1280, height = 960) {
  const context = await browser.newContext({ viewport: { width, height }, extraHTTPHeaders: { 'X-Test-User': user, 'X-Test-Role': role } });
  await context.addInitScript(({ user, role }) => {
    const b64 = (v) => btoa(JSON.stringify(v)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    localStorage.setItem('velven-language', 'ka');
    localStorage.setItem('token', `${b64({ alg: 'none' })}.${b64({ sub: user, role, exp: 4102444800 })}.test`);
    localStorage.setItem('user', JSON.stringify({ id: user, fullName: user, roles: [role], role, isAgent: role === 'Agent' }));
  }, { user, role });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  return { page, context };
}

try {
  const { page: owner, context: ownerContext } = await session('owner', 'Client');
  const offers = [];
  for (const [apartmentId, share] of [[fixture.sharedListing, true], [fixture.privateListing, false], [fixture.rejectedListing, true]]) {
    await owner.goto(`${base}/clients`);
    const card = owner.locator('.client-card').filter({ has: owner.locator('h3', { hasText: `#${fixture.selected}` }) });
    await card.locator('.cc-offer').click();
    await owner.locator('.offer-options input').first().waitFor();
    await owner.locator('.offer-options label').filter({ hasText: apartmentId === fixture.sharedListing ? 'Browser shared apartment' : apartmentId === fixture.privateListing ? 'Browser selected client only' : 'Browser rejected apartment' }).locator('input').check();
    await owner.locator('.offer-share input').setChecked(share);
    check((await owner.locator('.offer-share').innerText()).includes('შესთავაზეთ სხვა შესაბამის კლიენტებსაც'), 'Georgian sharing copy');
    if (apartmentId === fixture.sharedListing) await owner.screenshot({ path: 'tmp/offer-integration/desktop-real-api.png' });
    const posted = owner.waitForResponse((r) => new URL(r.url()).pathname === '/api/apartment-offers' && r.request().method() === 'POST');
    await owner.locator('.offer-send').click();
    const response = await posted;
    check(response.ok(), 'offer persisted by API');
    offers.push((await response.json()).id);
    await owner.locator('.offer-success').waitFor();
    await owner.locator('.offer-close').click();
  }
  const { page: agent, context: agentContext } = await session('agent-a', 'Agent');
  const notices = await (await agent.request.get(`${base}/api/Crm/notifications`)).json();
  check(notices.items.some((n) => n.offerId === offers[0] && n.shareWithOtherClients && n.clientId === fixture.selected), 'responsible agent receives persisted notification');
  for (const [index, action] of [[0, 'approve'], [1, 'approve'], [2, 'reject']]) {
    await agent.goto(`${base}/crm/apartment-offers?offer=${offers[index]}`);
    const row = agent.locator('.offer.focused');
    await row.waitFor();
    const review = agent.waitForResponse((r) => new URL(r.url()).pathname === `/api/apartment-offers/${offers[index]}/${action}`);
    await row.locator(`button.${action === 'approve' ? 'primary' : 'secondary'}`).click();
    const response = await review;
    check(response.ok(), `${action} saved by API`);
    const result = await response.json();
    check(result.matchedClients === (index === 0 ? 1 : 0), 'sharing permission and actual requirements enforced');
    await agent.locator('.notice').waitFor();
  }
  const { page: otherAgent, context: otherContext } = await session('agent-b', 'Agent', 375, 812);
  await otherAgent.goto(`${base}/crm/apartment-offers`);
  await otherAgent.locator('.matches').waitFor();
  check((await otherAgent.locator('.matches').innerText()).includes(`#${fixture.compatible}`), 'compatible client reaches their agent');
  check(!(await otherAgent.locator('.matches').innerText()).includes(`#${fixture.incompatible}`), 'incompatible client excluded');
  await otherAgent.screenshot({ path: 'tmp/offer-integration/mobile-agent-real-api.png' });
  await owner.setViewportSize({ width: 375, height: 812 });
  await owner.goto(`${base}/clients`);
  await owner.locator('.cc-offer').first().click();
  await owner.locator('.offer-options').waitFor();
  await owner.locator('.offer-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await owner.screenshot({ path: 'tmp/offer-integration/mobile-real-api.png' });
  check(await owner.locator('.offer-foot').isVisible(), 'mobile submit footer visible');
  check(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile has no horizontal overflow');
  check(errors.length === 0, `no browser errors: ${errors.join('; ')}`);
  await Promise.all([ownerContext.close(), agentContext.close(), otherContext.close()]);
  console.log(`Real API browser journey: ${checks} checks passed`);
} finally { await browser.close(); server.closeAllConnections(); await new Promise((done) => server.close(done)); }
