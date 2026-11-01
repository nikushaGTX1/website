import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.CRM_UI_BASE || 'http://localhost:4200';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1720, height: 1100 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('velven-language', 'en');
    localStorage.setItem('token', 'review-test');
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 'agent-test', role: 'Admin', fullName: 'Andria' }),
    );
  });
  let failSave = false;
  let rows = Array.from({ length: 4 }, (_, i) => ({
    id: 284 + i,
    linkId: 1,
    agentUserId: 'agent-test',
    ownerName: ['Giorgi M.', 'Mariam K.', 'Nino G.', 'Levan D.'][i],
    ownerPhone: '+995555123456',
    dealType: 'Rent',
    data: {
      realEstateType: 'Apartment',
      location: i % 2 ? 'Saburtalo' : 'Vake',
      street: i % 2 ? 'University St' : 'Chavchavadze Avenue',
      totalPrice: [1100, 950, 1400, 800][i],
      currency: 'USD',
      bedrooms: 2,
      area: 72,
      floor: 5,
      totalFloors: 10,
      availableFrom: '2026-11-08',
      minimumRentalPeriod: 'Minimum 12 months',
      isPetFriendly: true,
      hasParking: true,
    },
    photos: ['/banner.jpg', '/agents-banner.jpeg', '/services-hero.png'],
    status: 'new',
    verification: {},
    agentNotes: '',
    createdAt: '2026-11-01T10:30:00Z',
    updatedAt: '2026-11-01T10:30:00Z',
  }));
  let patches = 0;
  const lead = {
    id: 1042,
    fullName: 'Client One',
    goal: 'Rent',
    currency: 'USD',
    status: 'qualified',
    budgetMin: 900,
    budgetMax: 1200,
    preferredDistricts: ['Vake'],
    bedrooms: 2,
    createdAt: '2026-11-01',
    source: 'manual',
  };
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/owner-listings/submissions')) {
      if (route.request().method() === 'PATCH') {
        patches++;
        if (failSave) {
          await route.fulfill({ status: 500, json: { message: 'Review save failed' } });
          return;
        }
        const id = Number(url.split('/').pop());
        const update = route.request().postDataJSON();
        rows = rows.map((r) => (r.id === id ? { ...r, ...update } : r));
        await route.fulfill({ json: rows.find((r) => r.id === id) });
        return;
      }
      await route.fulfill({ json: rows });
      return;
    }
    await route.fulfill({
      json: url.endsWith('/Crm/leads')
        ? [lead, { ...lead, id: 1043, budgetMax: 800 }, { ...lead, id: 1044, goal: 'Buy' }]
        : [],
    });
  });
  await page.goto(base + '/crm/owner-submissions');
  await page.locator('.property-panel').waitFor();
  assert.equal(await page.locator('.submission-row').count(), 4);
  assert.equal(await page.locator('.client-row').count(), 1);
  assert.equal(
    await page.locator('.property-panel h2').textContent(),
    '2-bedroom apartment in Vake',
  );
  await mkdir('tmp/owner-submissions', { recursive: true });
  await page.screenshot({ path: 'tmp/owner-submissions/desktop.png', fullPage: true });
  assert.equal(
    await page
      .locator('.review-layout')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
    3,
  );
  await page.locator('.photo-count').click();
  await page.locator('dialog[open]').waitFor();
  await page.getByRole('button', { name: 'Next photo' }).click();
  assert((await page.locator('.gallery-controls').textContent()).includes('2 / 3'));
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  for (const box of await page.locator('.checklist input').all()) await box.check();
  await page.locator('#review-note').fill('Owner confirmed a small dog is welcome.');
  await page.getByRole('button', { name: 'Mark as ready', exact: true }).click();
  await page.locator('.message.success').waitFor();
  assert.equal(patches, 1);
  assert.equal(rows[0].status, 'visited');
  assert.equal(rows[0].verification.reviewOwnerApproval, true);
  assert.equal(rows[0].agentNotes, 'Owner confirmed a small dog is welcome.');
  assert.equal(
    await page
      .locator('.review-tabs button.active')
      .textContent()
      .then((s) => s.replace(/\s+/g, ' ').trim()),
    'Ready 1',
  );
  await page.reload();
  await page.locator('.property-panel').waitFor();
  await page.getByRole('button', { name: /^Ready/ }).click();
  await page.locator('.checklist input:checked').first().waitFor();
  assert.equal(await page.locator('.checklist input:checked').count(), 4);
  assert.equal(
    await page.locator('#review-note').inputValue(),
    'Owner confirmed a small dog is welcome.',
  );
  failSave = true;
  await page.locator('#review-note').fill('Unsaved note');
  await page.getByRole('button', { name: 'Save review', exact: true }).click();
  await page.locator('.message.error').waitFor();
  assert.equal(await page.locator('#review-note').inputValue(), 'Unsaved note');
  failSave = false;
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /^Needs review/ }).click();
  await page.locator('.search input').fill('Mariam');
  assert.equal(await page.locator('.submission-row').count(), 1);
  assert((await page.locator('.owner-card').textContent()).includes('Mariam'));
  await page.locator('.search input').fill('does-not-exist');
  await page.locator('.selection-empty').waitFor();
  await page.locator('.search input').fill('');
  for (const width of [1280, 900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  }
  await page.screenshot({ path: 'tmp/owner-submissions/mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'Owner submissions passed: three-column layout, selection, matching, gallery, saved review and ready state, persistence, failed save, search, and responsive layouts.',
  );
} finally {
  await browser.close();
}
