import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { portraits } = JSON.parse(await readFile('public/images/ai-match/portraits/catalogue.json', 'utf8'));
const layouts = [...new Set(portraits.map((p) => p.layout))];
const selected = layouts.map((layout) => portraits.find((p) => p.layout === layout && p.pets.length === 3 && p.dogSize === 'Large'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('output/ai-match', { recursive: true });
try {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(() => localStorage.setItem('velven-language', 'en'));
    await context.route('**/api/**', (route) => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/client-board') ? {
      items: selected.map((entry, i) => ({ id: 1042 + i, identityVerified: true, nationality: 'Georgian',
        agent: { name: 'Andria', phone: '+995555123456', photo: null },
        profile: { propertyGoal: 'Rent', currency: 'USD', budgetMin: 900, budgetMax: 1200, districts: ['Vake', 'Saburtalo'], bedrooms: 2, minSize: 65,
          householdType: entry.layout.startsWith('family-') ? 'FamilyWithChildren' : entry.layout.startsWith('roommates-') ? 'Roommates' : entry.layout === 'relatives-three' ? 'Relatives' : entry.layout === 'corporate-four' ? 'CorporateHousing' : entry.layout === 'couple' ? 'Couple' : 'JustMe',
          gender: entry.gender || 'Male', adults: entry.adults, children: entry.children.length, childrenAgeGroups: entry.children,
          hasPet: true, petTypes: entry.pets, petCount: entry.pets.length, dogSize: entry.dogSize, petOtherType: 'Rabbit',
          lifestyles: [], transportation: [], topPriorities: ['ParkNearby', 'Balcony'], moveInTiming: 'Flexible', rentalDuration: 'TwelveMonths',
        },
      })), total: selected.length, page: 1, pageSize: 12,
    } : [] }));
    const page = await context.newPage();
    await page.goto((process.env.CLIENTS_UI_BASE || 'http://localhost:3098') + '/clients');
    await page.locator('.client-card').first().waitFor();
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.querySelectorAll('.client-card img')].map((img) => img.decode().catch(() => {}))); });
    const sources = await page.locator('.client-card .portrait-scene').evaluateAll((imgs) => imgs.map((img) => ({ src: img.getAttribute('src'), width: img.naturalWidth })));
    assert.equal(sources.length, 9, `${width}: all nine layouts use finished portraits`);
    sources.forEach((source, i) => { assert.equal(source.src, '/images/ai-match/portraits/' + selected[i].file); assert.ok(source.width > 0); });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}: page overflow`);
    assert.equal(await page.locator('.client-card').evaluateAll((cards) => cards.some((card) => card.scrollWidth > card.clientWidth + 1)), false, `${width}: card overflow`);
    if (width === 1440) await page.locator('.client-grid').screenshot({ path: 'output/ai-match/finished-household-cards.png' });
    console.log(`Passed all nine finished household layouts at ${width}px`);
    await context.close();
  }
} finally { await browser.close(); }
