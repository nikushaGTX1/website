import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.CRM_UI_BASE || 'http://localhost:4200';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('token', 'workspace-ui-test');
    localStorage.setItem('user', JSON.stringify({ id: 'workspace-ui-test', fullName: 'CRM Test', role: 'Admin' }));
  });
  let pendingSubmissions = 4;
  await page.route('**/api/**', route => route.fulfill({ json:
    route.request().url().endsWith('/owner-listings/submissions')
      ? Array.from({length: pendingSubmissions + 1}, (_, i) => ({ id:i+1, status:i < pendingSubmissions ? 'new' : 'published', photos:[], data:{}, ownerName:'Test owner', ownerPhone:'555123456', createdAt:'2026-11-01', dealType:'Rent' }))
      : []
  }));
  const sidebar = page.locator('.workspace-sidebar');
  const assertWorkspace = async () => {
    await sidebar.waitFor({ state: 'visible' });
    assert.equal(await page.locator('app-navigation.workspace-navigation').count(), 1);
    assert.equal(await page.locator('.route-content.workspace-content').count(), 1);
    assert.equal(await page.locator('app-navigation').count(), 1);
  };
  await page.goto(base + '/crm?tool=myhome');
  await assertWorkspace();
  await page.locator('.workspace-count').waitFor();
  assert.equal(await page.locator('.workspace-count').textContent().then(text => text.trim()), '4');
  await page.locator('app-myhome-verification').waitFor();
  assert.equal(await sidebar.locator('a.selected').getAttribute('href'), '/crm?tool=myhome');
  await sidebar.locator('a[href="/crm?tool=intake"]').click();
  await page.locator('app-client-intake-card').waitFor();
  await assertWorkspace();
  assert.equal(await page.locator('app-myhome-verification').count(), 0);
  await sidebar.locator('a[href="/crm"]').first().click();
  await page.waitForURL(base + '/crm');
  await assertWorkspace();
  assert.equal(await page.locator('app-client-intake-card').count(), 0);
  await page.goBack();
  await page.locator('app-client-intake-card').waitFor();
  await assertWorkspace();
  await page.goForward();
  await page.waitForURL(base + '/crm');
  await assertWorkspace();
  await page.goto(base + '/crm?tool=myhome#verification-title');
  await assertWorkspace();
  for (const href of ['/crm/listings', '/crm/owner-submissions', '/crm/photo-cleaner']) {
    await sidebar.locator('a[href="' + href + '"]').click();
    await page.waitForURL(base + href);
    await assertWorkspace();
  }
  for (const href of ['/crm/saved', '/crm/reviews', '/crm/profile', '/crm/viewings']) {
    assert.equal(await sidebar.locator('a[href="' + href + '"]').count(), 0);
  }
  await page.locator('app-profile-burger-menu button.profile-burger').click();
  for (const href of ['/saved-listings', '/my-reviews', '/my-profile', '/my-viewings']) {
    await page.locator('.burger-menu.open a[href="' + href + '"]').waitFor({ state: 'visible' });
  }
  pendingSubmissions = 0;
  await page.locator('.burger-menu.open a[href="/saved-listings"]').click();
  await page.waitForURL(base + '/crm/saved');
  await page.locator('.workspace-count').waitFor({ state: 'hidden' });
  await assertWorkspace();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/crm?tool=myhome');
  await page.locator('.workspace-menu-toggle').click();
  await page.waitForTimeout(250);
  assert.equal(await sidebar.evaluate(el => Math.abs(el.getBoundingClientRect().left) < 1), true);
  await sidebar.locator('a[href="/crm?tool=intake"]').click();
  await page.locator('app-client-intake-card').waitFor();
  assert.equal(await sidebar.evaluate(el => el.classList.contains('mobile-open')), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log('CRM workspace checks passed: query/hash links, tool switching, sidebar routes, personal menu, mobile navigation.');
} finally {
  await browser.close();
}
