import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Browser-only fixtures: never sent to a real API or persisted in production.
const base = process.env.MYHOME_UI_BASE || 'http://localhost:3099';
const browser = await chromium.launch({
  channel: process.env.MYHOME_BROWSER || 'chrome',
  headless: true,
});
await mkdir('tmp/myhome-ui-results', { recursive: true });
let checks = 0;
try {
  for (const [role, width, path] of [
    ['Admin', 1440, '/admin'],
    ['Manager', 390, '/crm'],
    ['Agent', 390, '/admin'],
    ['Agent', 390, '/crm'],
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const user = {
      id: 'ui-test',
      roles: [role],
      role,
      fullName: 'UI Test',
      userName: 'test',
      email: 'test@example.invalid',
    };
    await context.addInitScript((user) => {
      window.addEventListener('message', (event) => {
        if (event.source === window && event.data?.source === 'velven-verification') {
          if ('token' in event.data || 'password' in event.data)
            throw Error('Credentials must not cross the bridge');
          window.postMessage(
            { source: 'nikas-verification', requestId: event.data.requestId, ok: true },
            location.origin,
          );
        }
      });
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem(
        'token',
        'test.' +
          btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, role: user.role })) +
          '.test',
      );
      localStorage.setItem('velven-language', 'en');
    }, user);
    const job = {
      id: '11111111-1111-1111-1111-111111111111',
      state: 'RUNNING',
      mode: 'BROWSER',
      totalApartments: 10,
      missingIds: 2,
      createdAt: new Date().toISOString(),
    };
    let started = 0;
    let reportTotal = 1;
    let missingId = false;
    await context.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      let data = [];
      if (url.pathname === '/api/MyHomeVerification/latest')
        data = {
          job,
          counts: [
            { status: 'PENDING', count: job.state === 'RUNNING' ? 4 : 0 },
            { status: 'REMOVED', count: 2 },
            { status: 'ACTIVE', count: 2 },
          ],
        };
      else if (url.pathname === '/api/MyHomeVerification/jobs') {
        assert.equal(url.searchParams.get('mode'), 'browser');
        started++;
        data = job;
      } else if (url.pathname.endsWith('/results'))
        data = {
          total: reportTotal,
          items: [
            {
              id: 1,
              apartmentId: 7,
              myHomeId: missingId ? '' : '12345678',
              address: 'Test address',
              status: missingId ? 'NO_MYHOME_ID' : 'REMOVED',
              checkedAt: new Date().toISOString(),
              detail: 'MyHome explicitly reports deleted or inactive listing',
            },
          ],
        };
      else if (url.pathname.endsWith('/metrics'))
        data = { totalLeads: 0, statusCounts: {}, totalTasks: 0 };
      else if (url.pathname.endsWith('/me')) data = user;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + path);
    const panel = page.locator('app-myhome-verification');
    // The panel is hidden until opened (admin: MyHome tab; CRM: header button).
    if (role !== 'Agent') await page.getByRole('button', { name: /MyHome/ }).first().click();
    if (role === 'Agent') {
      await page.waitForTimeout(700);
      assert.equal(await panel.count(), 0, 'Agents must not see verification controls');
      checks++;
      await context.close();
      continue;
    }
    await panel.getByRole('heading', { name: 'MyHome verification' }).waitFor();
    await panel.getByText(/50%/).first().waitFor();
    await panel.getByRole('button', { name: 'Resume verification', exact: true }).click();
    await panel
      .getByText('Extension connected. Checking listings in your browser.', { exact: true })
      .waitFor();
    assert.equal(await panel.getByRole('button', { name: 'Checking listings' }).isDisabled(), true);
    await panel.getByRole('button', { name: 'Show report' }).click();
    await panel.locator('tbody tr.removed-row').waitFor();
    reportTotal = 100;
    await panel.getByRole('button', { name: 'Refresh', exact: true }).click();
    await panel.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForFunction(() =>
      /Page\s+2\s*\/\s*2/.test(
        document.querySelector('app-myhome-verification .pagination')?.textContent || '',
      ),
    );
    reportTotal = 1;
    missingId = true;
    await panel.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.waitForFunction(() =>
      /Page\s+1\s*\/\s*1/.test(
        document.querySelector('app-myhome-verification .pagination')?.textContent || '',
      ),
    );
    await panel.locator('tbody .badge').filter({ hasText: 'Missing MyHome IDs' }).waitFor();
    assert.equal(await panel.getByRole('link', { name: 'Open MyHome' }).count(), 0);
    missingId = false;
    await panel.getByRole('button', { name: 'Refresh', exact: true }).click();
    await panel.locator('tbody tr.removed-row').waitFor();
    assert.equal(await panel.locator('progress').getAttribute('value'), '4');
    assert.equal(
      await panel.getByRole('link', { name: 'Open MyHome' }).getAttribute('href'),
      'https://www.myhome.ge/ka/pr/12345678',
    );
    await panel.getByRole('button', { name: /Review removed listings/ }).click();
    assert.equal(
      await panel
        .getByRole('button', { name: 'Removed', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    await panel.getByRole('searchbox').fill('12345678');
    await page.waitForTimeout(400);
    job.state = 'COMPLETED';
    await panel.getByRole('button', { name: 'Refresh', exact: true }).click();
    await panel.getByText('Verification complete', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Verify MyHome Listings', exact: true }).click();
    await page.waitForTimeout(300);
    assert.equal(started, 1);
    await page.reload();
    await panel.getByText('Verification complete', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'Show report' }).click();
    await panel.locator('tbody tr.removed-row').waitFor();
    const bounds = await panel.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Panel fits viewport');
    await page.waitForTimeout(600); // Allow the existing route entrance animation to finish.
    await panel.screenshot({ path: `tmp/myhome-ui-results/${role.toLowerCase()}-${width}.png` });
    assert.equal(errors.filter((e) => /MyHome|verification/i.test(e)).length, 0, errors.join('\n'));
    checks++;
    await context.close();
  }
  console.log(
    `PASS: ${checks} browser scenarios (desktop admin, mobile manager, agent restrictions on both dashboards).`,
  );
} finally {
  await browser.close();
}
