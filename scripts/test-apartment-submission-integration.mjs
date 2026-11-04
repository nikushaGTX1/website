// Invoked by ApartmentSubmissionTests with an isolated PostgreSQL database and test-only HTTP host.
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
await mkdir('tmp/submission-integration', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
async function session(user, role, width = 1280, height = 960) {
  const context = await browser.newContext({ viewport: { width, height }, extraHTTPHeaders: role ? { 'X-Test-User': user, 'X-Test-Role': role } : {} });
  await context.addInitScript(({ user, role }) => {
    const b64 = (v) => btoa(JSON.stringify(v)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    localStorage.setItem('velven-language', 'ka');
    if (role) localStorage.setItem('token', `${b64({ alg: 'none' })}.${b64({ sub: user, role, exp: 4102444800 })}.test`);
    if (role) localStorage.setItem('user', JSON.stringify({ id: user, fullName: user, roles: [role], role, isAgent: role === 'Agent' }));
  }, { user, role });
  const page = await context.newPage();
  await page.route('https://storage.example.invalid/test-apartment.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from(fixture.png, 'base64') }));
  page.on('pageerror', (error) => errors.push(error.message));
  return { page, context };
}

try {
  const { page: owner, context: ownerContext } = await session('anonymous', null);
  await owner.goto(`${base}/clients`);
  await owner.locator('.client-card').first().waitFor();
  check(await owner.locator('.client-card').count() === 2, 'only public eligible client cards');
  check(await owner.locator('.cc-offer,.bottom-banner,app-offer-apartment-modal').count() === 0, 'obsolete actions, banner and modal removed');
  check((await owner.locator('.cc-contact').first().getAttribute('href')).startsWith('tel:'), 'contact agent still works');
  check(!(await owner.locator('.client-grid').innerText()).includes('SECRET'), 'private Match client data absent');
  for (const [width, height] of [[320, 568], [375, 812], [768, 1024], [1440, 1080]]) {
    await owner.setViewportSize({ width, height });
    check(await owner.locator('.general-submit').isVisible(), 'general entry visible');
    check(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `client page fits ${width}`);
    await owner.screenshot({ path: `tmp/submission-integration/clients-${width}.png`, animations: 'disabled' });
  }
  await owner.locator('.general-submit').click();
  await owner.waitForURL('**/submit-apartment');
  await owner.locator('input[name=ownerName]').waitFor();
  await owner.locator('button.submit').click();
  check(await owner.locator('.err').count() > 0, 'required fields validated');
  // Other-city/manual address mode accepts Georgian city names without geocoding calls.
  await owner.locator('input[name=city]').fill('თბილისი');
  await owner.locator('input[name=location]').fill('Vake');
  await owner.locator('input[name=street]').fill('Abashidze');
  await owner.locator('input[name=streetNumber]').fill('12');
  await owner.locator('input[name=totalPrice]').fill('1000');
  await owner.locator('input[name=area]').fill('85');
  await owner.locator('input[name=floor]').fill('3');
  await owner.locator('input[name=totalFloors]').fill('8');
  await owner.locator('.counter').nth(0).locator('button').last().click({ clickCount: 2 });
  await owner.locator('.counter').nth(1).locator('button').last().click();
  await owner.locator('.card').nth(0).locator('.pill-row').nth(0).locator('button').first().click();
  await owner.locator('.card').nth(0).locator('.pill-row').nth(1).locator('button').nth(1).click();
  // Furnished and pet-friendly are explicit existing feature toggles.
  await owner.locator('.feature-grid button').nth(6).click();
  await owner.locator('.feature-grid button').nth(7).click();
  await owner.locator('app-date-picker[name=availableFrom] .dp-trigger').click();
  await owner.locator('.dp-today').click();
  await owner.locator('textarea[name=description]').fill('ნათელი ბინა აივნით, ავეჯით და საჭირო ტექნიკით.');
  await owner.locator('input[name=ownerName]').fill('Browser Owner');
  await owner.locator('input[name=ownerPhone]').fill('555123456');
  await owner.locator('input[type=file]').setInputFiles({ name: 'apartment.png', mimeType: 'image/png', buffer: Buffer.from(fixture.png, 'base64') });
  for (const width of [320, 375, 768, 1440]) {
    await owner.setViewportSize({ width, height: width < 768 ? 812 : 1080 });
    check(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `form fits ${width}`);
    await owner.screenshot({ path: `tmp/submission-integration/form-${width}.png`, fullPage: true, animations: 'disabled' });
  }
  const submitted = owner.waitForResponse(r => r.url().endsWith('/api/owner-listings/submissions') && r.request().method() === 'POST');
  await owner.locator('button.submit').click();
  check(!(await owner.locator('.err:visible').allTextContents()).length, `submission has no field errors: ${(await owner.locator('.err:visible').allTextContents()).join('; ')}`);
  const response = await submitted; check(response.ok(), `general submission persisted: ${await response.text()}`);
  const id = (await response.json()).id;
  await owner.locator('.success-card').waitFor();
  check(await owner.locator('app-offer-apartment-modal').count() === 0, 'no selected-client submission');
  const { page: agent, context: agentContext } = await session('agent-a', 'Agent', 1440, 1080);
  await agent.goto(`${base}/crm/owner-submissions?submission=${id}`);
  await agent.locator('.general-workflow').waitFor();
  check(await agent.locator('.owner-card').innerText().then(text => text.includes('Browser Owner')), 'assigned agent receives owner contact');
  await agent.locator('.general-workflow button').nth(0).click();
  await agent.waitForURL(`**/crm/owner-submissions/${id}/edit`);
  await agent.locator('input[name=totalPrice]').waitFor();
  await agent.locator('input[name=totalPrice]').fill('1100');
  const edited = agent.waitForResponse(r => r.url().endsWith(`/api/owner-listings/submissions/${id}`) && r.request().method() === 'PATCH');
  await agent.locator('button.submit').click(); check((await edited).ok(), 'agent corrects actual apartment details');
  await agent.locator('.success-card a').click();
  await agent.goto(`${base}/crm/owner-submissions?submission=${id}`);
  await agent.locator('.general-workflow').waitFor();
  let saved = agent.waitForResponse(r => r.url().endsWith(`/api/owner-listings/submissions/${id}`) && r.request().method() === 'PATCH');
  await agent.locator('.general-workflow button').nth(1).click(); check((await saved).ok(), 'owner contact recorded');
  await agent.locator('.checklist input').first().waitFor();
  for (const checkbox of await agent.locator('.checklist input').all()) await checkbox.check();
  saved = agent.waitForResponse(r => r.url().endsWith(`/api/owner-listings/submissions/${id}`) && r.request().method() === 'PATCH');
  await agent.locator('.property-panel button.outline').last().click(); check((await saved).ok(), 'verification checklist persisted');
  let reviewed = agent.waitForResponse(r => r.url().endsWith(`/submissions/${id}/approve`));
  await agent.locator('.approve-submission').click(); check((await reviewed).ok(), 'agent approves');
  reviewed = agent.waitForResponse(r => r.url().endsWith(`/submissions/${id}/send`));
  await agent.locator('.send-submission').click();
  const sent = await reviewed; check(sent.ok(), 'SEND succeeds');
  check((await sent.json()).matchedClients === 3, 'SEND includes public, private agent profile and private Match user');
  await agent.locator('.distribution-history').getByText('გავრცელებულია', { exact: true }).waitFor();
  check(await agent.locator('.send-submission').isDisabled(), 'SEND cannot be duplicated from dashboard');
  for (const width of [375, 1440]) {
    await agent.setViewportSize({ width, height: width === 375 ? 812 : 1080 });
    check(await agent.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `agent page fits ${width}`);
    await agent.screenshot({ path: `tmp/submission-integration/dashboard-${width}.png`, fullPage: true, animations: 'disabled' });
  }
  const { page: recipient, context: recipientContext } = await session('agent-b', 'Agent', 375, 812);
  await recipient.goto(`${base}/crm/submission-matches`);
  await recipient.locator('app-submission-matches article').first().waitFor();
  check((await recipient.locator('app-submission-matches').innerText()).includes(`#${fixture.privateClient}`), 'private agent intake client receives approved apartment internally');
  check(!(await recipient.locator('app-submission-matches').innerText()).includes(`#${fixture.wrongClient}`), 'incompatible client excluded');
  check(errors.length === 0, `no browser runtime errors: ${errors.join('; ')}`);
  await Promise.all([ownerContext.close(), agentContext.close(), recipientContext.close()]);
  console.log(`Apartment submission browser integration: ${checks} checks passed`);
} finally { await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done)); }
