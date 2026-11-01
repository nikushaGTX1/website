import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.CRM_UI_BASE || 'http://localhost:4200';
try {
  for (const role of ['Agent', 'Manager', 'Owner']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript((role) => {
      localStorage.setItem('velven-language', 'en');
      localStorage.setItem('token', 'notification-test');
      localStorage.setItem('user', JSON.stringify({ id: 'agent', fullName: 'Test Agent', role }));
    }, role);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const staff = role !== 'Owner';
    const endpoint = staff ? '/api/Crm/notifications' : '/api/listing-interest/notifications';
    const lead = {
      id: 42,
      fullName: 'Giorgi Client',
      status: 'won',
      assignedAgentId: 'agent',
      source: 'manual',
      createdAt: '2026-11-01T12:00:00Z',
      activities: [],
      tasks: [],
    };
    let notifications = staff
      ? [
          {
            id: 1,
            type: 'crm-status',
            leadId: 42,
            leadName: 'Giorgi Client',
            actorName: 'Andria Manager',
            fromStatus: 'lost',
            toStatus: 'won',
            createdAt: new Date().toISOString(),
            readAt: null,
            apartment: null,
          },
          {
            id: 1,
            type: 'interest-review',
            createdAt: new Date().toISOString(),
            readAt: null,
            apartment: { id: 8, title: 'Home', district: 'Vake', price: 1100, bedrooms: 2 },
          },
        ]
      : [
          {
            id: 1,
            type: 'interest',
            createdAt: new Date().toISOString(),
            readAt: null,
            apartment: { id: 8, title: 'Home', district: 'Vake', price: 1100, bedrooms: 2 },
          },
        ];
    const requests = [];
    let failReadAll = false;
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      requests.push(path);
      if (path === endpoint + '/summary') {
        await route.fulfill({ json: { unread: notifications.filter((n) => !n.readAt).length } });
        return;
      }
      if (path === endpoint) {
        await route.fulfill({
          json: {
            items: notifications,
            total: notifications.length,
            unread: notifications.filter((n) => !n.readAt).length,
            page: 1,
            pageSize: 10,
          },
        });
        return;
      }
      if (path === endpoint + '/read-all') {
        if (failReadAll) {
          await route.fulfill({ status: 500, json: {} });
          return;
        }
        notifications.forEach((n) => (n.readAt = new Date().toISOString()));
        await route.fulfill({ status: 204 });
        return;
      }
      if (path === endpoint + '/crm-status/1/read') {
        notifications.find((n) => n.type === 'crm-status').readAt = new Date().toISOString();
        await route.fulfill({ status: 204 });
        return;
      }
      if (path === '/api/Crm/leads/42') {
        await route.fulfill({ json: lead });
        return;
      }
      await route.fulfill({ json: path === '/api/Crm/leads' ? [lead] : [] });
    });
    await page.goto(base + (staff ? '/crm' : '/my-viewings'));
    const bell = page.locator('.bell-desktop .bell-button');
    await page.locator('.bell-desktop .bell-badge').waitFor();
    assert.equal(
      (await page.locator('.bell-desktop .bell-badge').textContent()).trim(),
      staff ? '2' : '1',
    );
    await bell.click();
    await page.locator('.bell-panel .notice').first().waitFor();
    if (staff) {
      assert(
        (await page.locator('.bell-panel').textContent()).includes(
          'Andria Manager changed Giorgi Client from Lost to Won.',
        ),
      );
      assert.equal(await page.locator('.crm-notice-icon').count(), 1);
      await page.locator('.notice').filter({ hasText: 'Lead status changed' }).click();
      await page.waitForURL('**/crm/leads/42');
      assert(requests.includes(endpoint + '/crm-status/1/read'));
      assert.equal(notifications.find((n) => n.type === 'interest-review').readAt, null);
      await bell.click();
      await page.locator('.bell-panel .notice').first().waitFor();
      assert.equal(await page.locator('.notice.unread').count(), 1);
      failReadAll = true;
      await Promise.all([
        page.waitForResponse(
          (response) => response.url().endsWith('/read-all') && response.status() === 500,
        ),
        page.getByRole('button', { name: 'Mark all as read', exact: true }).click(),
      ]);
      await page.waitForTimeout(100);
      assert.equal(await page.locator('.notice.unread').count(), 1);
      failReadAll = false;
    } else {
      assert((await page.locator('.bell-panel').textContent()).includes('New interested client!'));
      assert(!requests.some((path) => path.startsWith('/api/Crm/notifications')));
    }
    await page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
    await page.locator('.bell-desktop .bell-badge').waitFor({ state: 'hidden' });
    assert.equal(notifications.filter((n) => !n.readAt).length, 0);
    if (staff) {
      notifications.push({
        id: 2,
        type: 'crm-status',
        leadId: 42,
        leadName: 'Giorgi Client',
        actorName: 'Another Manager',
        fromStatus: 'won',
        toStatus: 'lost',
        createdAt: new Date().toISOString(),
        readAt: null,
        apartment: null,
      });
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page
        .locator('.notice')
        .filter({ hasText: 'Another Manager changed Giorgi Client from Won to Lost.' })
        .waitFor();
      assert.equal((await page.locator('.bell-desktop .bell-badge').textContent()).trim(), '1');
    }
    notifications = [];
    await bell.click();
    await bell.click();
    await page.locator('.panel-empty').waitFor();
    if (staff)
      assert(
        (await page.locator('.panel-empty').textContent()).includes(
          'Lead status changes and client matches will appear here.',
        ),
      );
    await page.keyboard.press('Escape');
    await page.locator('.bell-panel').waitFor({ state: 'hidden' });
    if (staff) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.bell-mobile .bell-button').click();
      await page.locator('.panel-empty').waitFor();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    'CRM bell checks passed: agents/managers, combined feed, status message, lead deep link, isolated read IDs, read-all rollback, empty state, mobile, and owner compatibility.',
  );
} finally {
  await browser.close();
}
