import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.CLIENTS_UI_BASE || 'http://localhost:3098';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('tmp/clients-ui', { recursive: true });
const profile = {
  propertyGoal: 'Rent',
  districts: ['Vake', 'Saburtalo'],
  locationFlexible: false,
  budgetMin: 800,
  budgetMax: 1400,
  currency: 'USD',
  gender: 'Female',
  householdType: 'Couple',
  adults: 2,
  children: 0,
  childrenAgeGroups: [],
  bedrooms: 2,
  bedroomChoices: [2],
  transportation: ['Walking'],
  lifestyles: ['RemoteWorker'],
  topPriorities: ['Workspace', 'Parking', 'ParkNearby', 'QuietStreet', 'MetroNearby'],
  hasPet: true,
  petType: 'Dog',
  petTypes: ['Dog', 'Cat'],
  dogSize: 'Medium',
  petCount: 2,
  moveInTiming: 'Flexible',
  rentalDuration: 'TwelveMonths',
  apartmentStyle: 'Modern',
};
const card = (id) => ({
  id,
  identityVerified: id === 1042,
  nationality: 'Georgia',
  profile: {
    ...profile,
    districts: id === 1044 ? [] : profile.districts,
    topPriorities: profile.topPriorities.slice(0, 3),
  },
  agent: { name: 'Test Agent', phone: '+995555999888', photo: null },
});
let checks = 0;
try {
  for (const language of process.env.CLIENTS_UI_LANGUAGE
    ? [process.env.CLIENTS_UI_LANGUAGE]
    : ['en', 'ka', 'ru'])
    for (const width of process.env.CLIENTS_UI_WIDTH
      ? [Number(process.env.CLIENTS_UI_WIDTH)]
      : [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        permissions: ['clipboard-read', 'clipboard-write'],
      });
      await context.addInitScript((language) => {
        localStorage.setItem('velven-language', language);
        if (sessionStorage.getItem('guest')) return;
        localStorage.setItem(
          'user',
          JSON.stringify({ id: 'fixture', fullName: 'Test Agent', roles: ['Admin'] }),
        );
        localStorage.setItem(
          'token',
          'fixture.' +
            btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) +
            '.fixture',
        );
      }, language);
      let state = 'normal',
        lastQuery,
        submitted,
        intakeCount = 0,
        links = [],
        revoked = false,
        changedStatus = 'Active';
      await context.route('**/api/**', async (route) => {
        const url = new URL(route.request().url()),
          path = url.pathname,
          method = route.request().method();
        let result = [];
        if (path.endsWith('/client-board')) {
          lastQuery = url.searchParams;
          if (state === 'loading') await new Promise((r) => setTimeout(r, 1200));
          if (state === 'error') return route.fulfill({ status: 503, json: {} });
          result = {
            items: state === 'empty' ? [] : [card(1042), card(1043), card(1044)],
            total: state === 'empty' ? 0 : 15,
            page: Number(url.searchParams.get('page') || 1),
            pageSize: 12,
          };
        } else if (path.endsWith('/client-intake-links')) {
          if (method === 'POST')
            links = [
              {
                id: 1,
                token: 'fixture-token',
                slug: null,
                isActive: true,
                createdAt: new Date().toISOString(),
              },
            ];
          result = method === 'POST' ? links[0] : links;
        } else if (path.endsWith('/client-intake-links/1')) {
          revoked = true;
          links[0].isActive = false;
          return route.fulfill({ status: 204 });
        } else if (path.endsWith('/client-profiles'))
          result = {
            items: [
              {
                id: 1042,
                firstName: 'PRIVATE CLIENT',
                phone: '555111222',
                status: changedStatus,
                createdAt: new Date().toISOString(),
                leadId: 1,
                published: true,
              },
            ],
            total: 1,
          };
        else if (path.endsWith('/client-profiles/1042/status')) {
          if (state === 'status-error') return route.fulfill({ status: 503, json: {} });
          changedStatus = route.request().postDataJSON().status;
          return route.fulfill({ status: 204 });
        } else if (path.includes('/client-intake/')) {
          intakeCount++;
          submitted = route.request().postDataJSON();
          if (state === 'intake-error')
            return route.fulfill({ status: 404, json: { code: 'invalid_intake' } });
          result = { id: 1042 };
        } else if (path.includes('/ai-home-match/matches'))
          result = { matches: [], totalMatches: 0 };
        else if (path.endsWith('/Profile/me'))
          result = { id: 'fixture', fullName: 'Test Agent', roles: ['Admin'] };
        else if (path.endsWith('/MyHomeVerification/latest'))
          result = { job: null, counts: {}, latestCheckedAt: null };
        await route.fulfill({ json: result });
      });
      await context.route('https://api.frankfurter.dev/**', (route) =>
        route.fulfill({ json: { rate: 2.7 } }),
      );
      const page = await context.newPage(),
        errors = [];
      page.on('pageerror', (e) => {
        errors.push(e.message);
        console.error(e.message);
      });
      page.on('console', (message) => {
        if (message.type() === 'error' && /^ERROR\b/.test(message.text()))
          errors.push(message.text());
      });
      const noOverflow = async (area) =>
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
          `${area} ${language} ${width}: horizontal overflow`,
        );
      state = 'loading';
      const response = await page.goto(base + '/clients');
      assert.equal(response.status(), 200, '/clients must be recognised by Express');
      await page.locator('.skeleton-grid').waitFor();
      await page.locator('.client-card').first().waitFor();
      state = 'normal';
      await page.waitForFunction(
        (language) => document.documentElement.lang === language,
        language,
      );
      await page.waitForTimeout(200);
      assert.equal(
        await page.locator('app-navigation').count(),
        1,
        'Clients retains the site navigation',
      );
      const clientsLink = page.locator('.nav-links a[href="/clients"]');
      assert.equal(
        await clientsLink.textContent(),
        language === 'ka' ? 'კლიენტები' : language === 'ru' ? 'Клиенты' : 'Clients',
      );
      assert.equal(await page.locator('app-footer').count(), 1);
      assert.match(
        await page.locator('h1').innerText(),
        language === 'en' ? /Meet your next tenant./ : /\s/,
      );
      assert.match(
        await page.locator('h1').evaluate((el) => getComputedStyle(el).fontFamily),
        /Manrope|Noto Sans Georgian/, // the site font, not a serif
      );
      assert.equal(
        await page.locator('.section-heading h2').innerText(),
        language === 'ka'
          ? 'აქტიური კლიენტები'
          : language === 'ru'
            ? 'Активные клиенты'
            : 'Active clients',
      );
      assert.equal(await page.locator('.cc-kyc').count(), 1);
      assert.equal(await page.locator('.client-card app-velven-lifestyle-avatar').count(), 0, 'cards have no portraits');
      assert.ok(!(await page.locator('.clients-page').innerText()).includes('PRIVATE CLIENT'));
      await noOverflow('clients');
      await page.locator('.filter').nth(0).locator('.filter-trigger').click();
      await page.locator('.area-dialog').waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'area picker overflow');
      await page.locator('.area-popular button').first().click();
      await page.locator('.area-apply').click();
      await page.locator('.area-dialog').waitFor({state:'detached'});
      await page.locator('.filter').nth(1).locator('.filter-trigger').click();
      await page.locator('.filter-options [role=option], .sheet-options [role=option]').nth(2).click();
      await page.locator('.filter-options, .sheet-options').first().waitFor({state:'detached'});
      await page.locator('.filter').nth(2).locator('.filter-trigger').click();
      await page.locator('.filter-options [role=option], .sheet-options [role=option]').nth(2).click();
      await page.locator('.filter-options, .sheet-options').first().waitFor({state:'detached'});
      await page.locator('.filter').nth(3).locator('.filter-trigger').click();
      await page.locator('.filter-options [role=option], .sheet-options [role=option]').nth(2).click();
      await page.locator('.filter-options, .sheet-options').first().waitFor({state:'detached'});
      await page.locator('.filter').nth(4).locator('.filter-trigger').click();
      await page.locator('.filter-options [role=option], .sheet-options [role=option]').nth(1).click();
      await page.locator('.filter-options, .sheet-options').first().waitFor({state:'detached'});
      await page.locator('.filters button[type=submit]').click();
      await page.waitForTimeout(150);
      assert.equal(lastQuery.get('district'), 'Vake');
      assert.equal(lastQuery.get('budgetMax'), '1000');
      assert.equal(lastQuery.get('residents'), '2');
      assert.equal(lastQuery.get('pets'), 'true');
      assert.match(lastQuery.get('moveInBefore'), /^\d{4}-\d{2}-\d{2}$/);
      await page.locator('.pagination button').last().click();
      await page.waitForTimeout(100);
      assert.equal(lastQuery.get('page'), '2');
      const suggest = await page.locator('.cc-offer').first().getAttribute('href');
      assert.ok(
        suggest.includes('district=Vake') &&
          suggest.includes('bedrooms=2') &&
          suggest.includes('client=1042'),
      );
      if (width === 390 || width === 1440) {
        await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
        await page.waitForTimeout(150);
        await page.screenshot({
          path: `tmp/clients-ui/${language}-${width}.png`,
          fullPage: true,
          animations: 'disabled',
        });
      }
      state = 'empty';
      await page.locator('.filters button[type=submit]').click();
      await page.locator('.state').waitFor();
      await noOverflow('empty');
      state = 'error';
      await page.locator('.filters button[type=submit]').click();
      await page.locator('.state[role=alert]').waitFor();
      await noOverflow('error');
      state = 'normal';
      await page.locator('.state button').click();
      await page.locator('.client-card').first().waitFor();
      await page.goto(base + '/admin');
      await page.locator('.admin-tabs button, nav button', { hasText: /Client intake|კლიენტების მიღება|Приём клиентов/ }).first().click();
      await page.locator('.intake-card').waitFor();
      await page.locator('.intake-card header button').click();
      await page.locator('.link-row input').waitFor();
      assert.match(
        await page.locator('.link-row input').inputValue(),
        /\/ai-home-match\?intake=fixture-token$/,
      );
      assert.ok(
        (await page.locator('.actions a').nth(1).getAttribute('href')).startsWith('https://wa.me/'),
      );
      assert.ok(
        (await page.locator('.actions a').nth(2).getAttribute('href')).startsWith(
          'https://t.me/share/url',
        ),
      );
      await page.locator('.actions button').first().click();
      await page.waitForFunction(async () =>
        (await navigator.clipboard.readText()).endsWith('intake=fixture-token'),
      );
      await page.locator('.submission select').selectOption('Paused');
      await page.waitForTimeout(100);
      assert.equal(changedStatus, 'Paused');
      state = 'status-error';
      await page.locator('.submission select').selectOption('Closed');
      await page.locator('.intake-card [role=alert]').waitFor();
      assert.equal(await page.locator('.submission select').inputValue(), 'Paused');
      state = 'normal';
      await noOverflow('admin intake');
      if (width === 390 || width === 1440)
        await page
          .locator('.intake-card')
          .screenshot({ path: `tmp/clients-ui/${language}-${width}-admin.png` });
      await page.locator('.revoke').click();
      await page.waitForTimeout(100);
      assert.equal(revoked, true);
      // Full intake-to-normal-results path, using the existing completed questionnaire session.
      await page.evaluate((profile) => {
        sessionStorage.setItem('guest', '1');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.setItem('velven:home-match-profile', JSON.stringify(profile));
      }, profile);
      await page.goto(base + '/ai-home-match?intake=fixture-token');
      await page.locator('app-home-profile-summary .primary').click();
      await page.locator('#intake-name').fill('Private Client');
      await page.locator('#intake-phone').fill('abc');
      await page.locator('input[name=consent]').check();
      await page.locator('.intake-contact button[type=submit]').click();
      await page.locator('.intake-contact [role=alert]').waitFor();
      assert.equal(intakeCount, 0);
      await page.locator('#intake-phone').fill('555123456');
      await page.locator('input[name=consent]').uncheck();
      await page.locator('.intake-contact button[type=submit]').click();
      assert.equal(intakeCount, 0);
      await page.locator('input[name=consent]').check();
      await noOverflow('intake');
      state = 'intake-error';
      await page.locator('.intake-contact button[type=submit]').click();
      await page.locator('.intake-contact [role=alert]').waitFor();
      state = 'normal';
      await page.locator('input[name=publishConsent]').check();
      await page.locator('.intake-contact button[type=submit]').click();
      await page.locator('app-home-match-results').waitFor();
      assert.equal(submitted.firstName, 'Private Client');
      assert.equal(submitted.profile.districts[0], 'Vake');
      assert.equal(submitted.profile.lifestyles[0], 'RemoteWorker');
      assert.equal(submitted.publishConsent, true);
      await noOverflow('match results');
      assert.deepEqual(errors, []);
      checks++;
      console.log(`Passed ${language} ${width}px`);
      await context.close();
    }
  console.log(
    `Passed ${checks} Clients browser scenarios: three languages, nine widths; API filters/pagination, loading/empty/error, privacy, admin copy/share/revoke/status, intake validation and normal Match results.`,
  );
} finally {
  await browser.close();
}
