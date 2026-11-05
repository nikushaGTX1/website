import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base=process.env.DISCOVER_UI_BASE || 'http://localhost:3098';
const browser=await chromium.launch({channel:'chrome',headless:true});
let checked=0;
try {
  for(const language of ['ka','en','ru']) for(const width of [320,390,1440]) for(const returnUrl of [null,'/upload-apartment']) {
    const context=await browser.newContext({viewport:{width,height:1100}});
    await context.addInitScript(language=>localStorage.setItem('velven-language',language),language);
    let registered;
    const user={id:'fixture',email:'fixture@example.invalid',fullName:'Test User',roles:['User']};
    await context.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      let result=[];
      if(path.endsWith('/Auth/register')) {registered=route.request().postDataJSON();result={email:user.email,emailSent:true,needsVerification:true};}
      else if(path.endsWith('/Auth/login')) result={token:'fixture.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,role:'User'})).toString('base64')+'.fixture',user};
      else if(path.endsWith('/Profile/me')) result=user;
      else if(path.endsWith('/preferences')) result={matchAlertsInApp:true,matchAlertsEmail:false,preferredLanguage:language};
      else if(path.endsWith('/notifications/summary')) result={newMatches:0,unread:0};
      await route.fulfill({json:result});
    });
    await context.route('**/maps.googleapis.com/**',r=>r.abort());
    await context.route('https://api.frankfurter.dev/**',r=>r.fulfill({json:{rate:2.7}}));
    const page=await context.newPage();
    await page.goto(base+'/register'+(returnUrl ? '?returnUrl='+encodeURIComponent(returnUrl) : ''));
    await page.locator('#reg-name').fill('Test User');
    assert.equal(await page.locator('[data-account]').count(), 0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await page.locator('.auth-card .owner-note:not(.match-note)').count(),returnUrl ? 1 : 0);
    await page.locator('#reg-email').fill(user.email);
    await page.locator('#reg-phone').fill('555 12 34 56');
    await page.locator('#reg-password').fill('Fixture123!');
    await page.locator('#reg-confirm').fill('Fixture123!');
    await page.locator('.auth-form .submit-btn').click();
    await page.locator('.cd-dialog').waitFor();
    assert.equal(Object.hasOwn(registered, 'accountType'), false);
    await page.locator('.cd-digits input').first().fill('123456');
    await page.waitForURL(url => url.pathname === (returnUrl ?? '/discover'));
    assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('user'))).roles,['User']);
    checked++;await context.close();
  }
  console.log(`Passed ${checked} registration scenarios: one account, three languages, three widths and both post-verification destinations.`);
} finally {await browser.close();}
