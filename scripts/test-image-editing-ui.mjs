import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import sharp from 'sharp';

const base = process.env.IMAGE_UI_BASE || 'http://127.0.0.1:4281';
const photo = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#b6a78d' } }).png().toBuffer();
const edited = await sharp(photo).modulate({ brightness: 1.1 }).png().toBuffer();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('velven-language', 'en');
    localStorage.setItem('token', 'offline-test');
    localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'Admin', fullName: 'Test Admin' }));
  });
  let calls = 0, approvals = 0, fail = false, limited = false;
  await page.route('**/api/**', async route => {
    const url = route.request().url();
    if (url.endsWith('/image-processing/availability')) return route.fulfill({ json: { enabled: true, canRemove: true } });
    if (url.endsWith('/image-processing/check')) {
      calls++;
      const body = route.request().postDataBuffer().toString('latin1');
      assert.match(body, /name="rightsConfirmed"/);
      assert.doesNotMatch(body, /OPENAI_API_KEY|api.openai.com|mode.*detect/);
      if (limited) return route.fulfill({ status: 429, body: '' });
      return route.fulfill(fail ? { status: 502, json: { message: 'Editing failed; no automatic retry.' } } : { json: { classification: 'authorized_edit', action: 'processed', cleanedImage: edited.toString('base64'), contentType: 'image/png', jobId: calls } });
    }
    if (url.endsWith('/approve-draft')) { approvals++; return route.fulfill({ json: {} }); }
    return route.fulfill({ json: [] });
  });
  await page.goto(base + '/crm/photo-cleaner');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'owned.png', mimeType: 'image/png', buffer: photo });
  assert.equal(calls, 0, 'Adding an image must not process automatically');
  const process = page.getByRole('button', { name: 'Process selected photos' });
  assert.equal(await process.isDisabled(), true);
  await page.getByRole('checkbox').first().check();
  await process.click();
  await page.getByRole('button', { name: 'Toggle before and after' }).waitFor();
  assert.equal(calls, 1);
  await page.getByRole('button', { name: 'Toggle before and after' }).click();
  assert.equal(await page.getByRole('button', { name: 'Toggle before and after' }).getAttribute('aria-pressed'), 'true');
  const originalDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download original', exact: true }).click();
  assert.equal((await originalDownload).suggestedFilename(), 'owned.png');
  const editedDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  assert.equal((await editedDownload).suggestedFilename(), 'owned-velven.png');
  fail = true;
  await page.locator('input[type=file]').first().setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: photo });
  assert.equal(calls, 1);
  await process.click();
  await page.getByText('Editing failed; no automatic retry.', { exact: true }).waitFor();
  assert.equal(calls, 2);
  fail = false;
  await mkdir('tmp/image-editing', { recursive: true });
  await page.screenshot({ path: 'tmp/image-editing/remover.png', fullPage: true });

  await page.goto(base + '/upload-apartment');
  await page.locator('input[type=file][accept*="image"]').first().setInputFiles({ name: 'listing.png', mimeType: 'image/png', buffer: photo });
  await page.locator('.uploaded-image-grid .uploaded-image').first().waitFor();
  assert.equal(calls, 2, 'Listing uploads must not invoke automatic scans');
  const create = page.getByRole('button', { name: 'Create edit preview', exact: true });
  assert.equal(await create.isDisabled(), true);
  await page.locator('input[name=photoRights]').check();
  const before = await page.locator('.image-thumbnail img').first().getAttribute('src');
  await create.click();
  await page.getByRole('button', { name: 'Approve for this listing' }).waitFor();
  assert.equal(calls, 3);
  assert.equal(await page.locator('.image-thumbnail img').first().getAttribute('src'), before, 'Unapproved preview must not replace selected image');
  await page.getByRole('button', { name: 'Approve for this listing' }).click();
  await page.getByRole('button', { name: 'Restore original', exact: true }).waitFor();
  assert.equal(approvals, 1);
  assert.notEqual(await page.locator('.image-thumbnail img').first().getAttribute('src'), before);
  await page.getByRole('button', { name: 'Restore original', exact: true }).click();
  assert.equal(await page.locator('.image-thumbnail img').first().getAttribute('src'), before);
  await page.screenshot({ path: 'tmp/image-editing/listing.png', fullPage: true });
  limited = true;
  await page.goto(base + '/crm/photo-cleaner');
  await page.locator('input[type=file]').first().setInputFiles([
    { name: 'pending-one.png', mimeType: 'image/png', buffer: photo },
    { name: 'pending-two.png', mimeType: 'image/png', buffer: photo },
  ]);
  await page.getByRole('checkbox').first().check();
  const callsBeforeLimit = calls;
  await page.getByRole('button', { name: 'Process selected photos' }).click();
  await page.locator('.notice').filter({ hasText: 'Image processing is temporarily unavailable' }).waitFor();
  assert.equal(calls, callsBeforeLimit + 1, 'Do not automatically retry or continue after 429');
  assert.equal(await page.locator('li[data-state=waiting]').count(), 2, 'Rate-limited photos remain queued');
  assert.equal(await page.locator('li[data-state=error]').count(), 0, 'Rate limits must not appear as image failures');
  assert.equal(await page.getByRole('button', { name: 'Process selected photos' }).isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log('Passed offline image-editing browser checks: explicit processing, consent, failure, comparison, downloads, listing preview, approval and restore.');
} finally { await browser.close(); }
