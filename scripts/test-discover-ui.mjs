import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.DISCOVER_UI_BASE || 'http://localhost:3098';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('tmp/discover-ui', { recursive: true });
let checks = 0;
try {
  for (const language of ['en', 'ka', 'ru']) for (const width of [320,375,390,430,768,1024,1280,1440,1920]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(language => {
      if (sessionStorage.getItem('guest')) return;
      localStorage.setItem('user', JSON.stringify({ id:'fixture', fullName:'Test Client', roles:['Client'] }));
      localStorage.setItem('token', 'fixture.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600}))+'.fixture');
      localStorage.setItem('velven-language',language);
    }, language);
    const profile = {propertyGoal:'Rent',districts:['Vake'],locationFlexible:false,budgetMin:0,budgetMax:1500,currency:'USD',adults:1,children:0,childrenAgeGroups:[],bedrooms:2,transportation:[],lifestyles:[],topPriorities:[],hasPet:false,moveInTiming:'Flexible',rentalDuration:'TwelveMonths'};
    const apartment = id => ({id,title:'Apartment for rent',description:'Deal: For Rent',price:1000,district:'Vake',bedrooms:2,sizeSquareMeters:80,isApproved:true,createdAt:new Date().toISOString()});
    let empty = false;
    const searches = [1,2].map(id => ({id,name:'Search '+id,profile,notificationsEnabled:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),criteriaSince:new Date().toISOString(),newMatches:1}));
    await context.route('**/api/**',async route => {
      const path = new URL(route.request().url()).pathname;
      let result = [];
      if(path.endsWith('/preferences')) result={matchAlertsInApp:true,matchAlertsEmail:false,preferredLanguage:language,emailConfirmed:true};
      else if(path.endsWith('/Profile/me')) result={id:'fixture',fullName:'Test Client',email:'test@example.invalid',userName:'fixture',roles:['Client']};
      else if(path.endsWith('/notifications/summary')) result={unread:2,newMatches:2};
      else if(path.endsWith('/searches')) result=empty?[]:searches;
      else if(path.endsWith('/matches') && path.includes('ai-home-match')) result={totalMatches:2,matches:[1,2].map(id=>({apartment:apartment(id),matchScore:90}))};
      else if(path.endsWith('/matches')) result=[1,2].map(id=>({savedSearchId:id,apartmentId:id,matchedAt:new Date().toISOString(),seenAt:null}));
      else if(path.endsWith('/notifications')) result={items:[1,2].map(id=>({id,readAt:null,savedSearchId:id,apartment:apartment(id),createdAt:new Date().toISOString()})),total:2,unread:2,page:1,pageSize:10};
      else if(path.endsWith('/Apartments')) result=[apartment(1),apartment(2)];
      else if(path.endsWith('/Favorites')) result=[{apartmentId:1}];
      await route.fulfill({json:result});
    });
    await context.route('https://api.frankfurter.dev/**',route=>route.fulfill({json:{rate:2.7}}));
    const page = await context.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/discover?search=1&apartment=1');
    await page.locator('#match-1').waitFor();
    await page.waitForFunction(language=>document.documentElement.lang===language,language);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${language} ${width}: overflow`);
    assert.equal(await page.locator('h1').innerText(),language==='ka'?'თქვენი მომავალი სახლი უფრო ახლოსაა, ვიდრე ფიქრობთ.':language==='ru'?'Ваш будущий дом ближе, чем вы думаете.':'Your next home is closer than you think.');
    // Query-only routing must select another search while retaining the same component.
    await page.locator('.bell-button:visible').click();
    await page.locator('.bell-panel:visible .notice').nth(1).click();
    await page.locator('#match-2.highlighted').waitFor();
    if(width===390 || width===1440) {
      await page.waitForTimeout(300);
      await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});
      await page.waitForTimeout(600);
      await page.screenshot({path:`tmp/discover-ui/${language}-${width}.png`,fullPage:true,animations:'disabled'});
    }
    // Custom sort menu: opens, changes the order, closes; never wider than the screen.
    await page.locator('.sort-trigger').click();
    await page.locator('.sort-options').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${language} ${width}: sort menu overflow`);
    if(width===390 || width===1440) { await page.locator('.sort-trigger').scrollIntoViewIfNeeded(); await page.screenshot({path:`tmp/discover-ui/${language}-${width}-sort.png`,animations:'disabled'}); }
    await page.locator('.sort-options button').nth(2).click();
    await page.locator('.sort-options').waitFor({state:'detached'});
    assert.equal(await page.locator('.sort-text b').innerText(),language==='ka'?'ფასი: ზრდადობით':language==='ru'?'Цена: по возрастанию':'Price: low to high');
    empty=true;
    await page.goto(base+'/discover?tab=saved');
    await page.locator('.card-grid app-discover-card').waitFor();
    assert.equal(await page.locator('.card-grid app-discover-card').count(),1);
    await page.goto(base+'/my-profile?section=notifications');
    await page.locator('.preference-list').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`profile ${language} ${width}`);
    // The language label must keep a readable width (it used to collapse to one letter per line).
    const labelWidth = await page.locator('.language-preference > span').evaluate(el=>el.getBoundingClientRect().width);
    assert.ok(labelWidth > 150, `profile ${language} ${width}: language label squeezed to ${labelWidth}px`);
    if(width===390 || width===1440) await page.locator('.discover-zone').screenshot({path:`tmp/discover-ui/${language}-${width}-profile.png`,animations:'disabled'});
    await page.evaluate(()=>{sessionStorage.setItem('guest','1');localStorage.removeItem('token');localStorage.removeItem('user');});
    await page.goto(base+'/register');
    await page.locator('#reg-name').fill('Test Client');
    await page.locator('#reg-email').fill('test@example.invalid');
    await page.locator('#reg-password').fill('Fixture123!');
    await page.locator('#reg-confirm').fill('Different123!');
    await page.locator('.auth-form button[type=submit]').click();
    await page.locator('.auth-card .error').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`register ${language} ${width}`);
    assert.deepEqual(errors,[]);
    checks++; await context.close();
  }
  console.log(`Passed ${checks} browser scenarios (three languages, nine widths): Discover, notification routing, favorites without searches, profile settings, registration validation.`);
} finally { await browser.close(); }
