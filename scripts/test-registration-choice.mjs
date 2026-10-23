import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base=process.env.DISCOVER_UI_BASE || 'http://localhost:3098';
const browser=await chromium.launch({channel:'chrome',headless:true});
await mkdir('tmp/account-choice',{recursive:true});
let checked=0;
try {
  for(const language of ['ka','en','ru']) for(const width of [320,390,1440]) for(const type of ['Client','Owner']) {
    const context=await browser.newContext({viewport:{width,height:1100}});
    await context.addInitScript(language=>localStorage.setItem('velven-language',language),language);
    let registered;
    const user={id:'fixture',email:'fixture@example.invalid',fullName:'Test User',roles:['User',type]};
    await context.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      let result=[];
      if(path.endsWith('/Auth/register')) {registered=route.request().postDataJSON();result={email:user.email,emailSent:true,needsVerification:true};}
      else if(path.endsWith('/Auth/login')) result={token:'fixture.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,role:type})).toString('base64')+'.fixture',user};
      else if(path.endsWith('/Profile/me')) result=user;
      else if(path.endsWith('/preferences')) result={matchAlertsInApp:true,matchAlertsEmail:false,preferredLanguage:language};
      else if(path.endsWith('/notifications/summary')) result={newMatches:0,unread:0};
      await route.fulfill({json:result});
    });
    await context.route('**/maps.googleapis.com/**',r=>r.abort());
    await context.route('https://api.frankfurter.dev/**',r=>r.fulfill({json:{rate:2.7}}));
    const page=await context.newPage();
    await page.goto(base+'/register');
    await page.locator('#reg-name').fill('Test User');
    await page.locator('[data-account=owner]').click();
    await page.locator('[data-account=owner][aria-pressed=true]').waitFor();
    await page.locator('[data-account=client]').click();
    assert.equal(await page.locator('#reg-name').inputValue(),'Test User');
    await page.locator(`[data-account=${type.toLowerCase()}]`).click();
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${language} ${width} ${type}`);
    assert.equal(await page.locator('[data-account=owner]').innerText(),language==='ka'?'მეპატრონე':language==='ru'?'Собственник':'Property owner');
    assert.equal(await page.locator('.auth-card .owner-note:not(.match-note)').count(),type==='Owner'?1:0);
    if(width===390) await page.screenshot({path:`tmp/account-choice/${language}-${type}.png`,fullPage:true});
    await page.locator('#reg-email').fill(user.email);
    await page.locator('#reg-password').fill('Fixture123!');
    await page.locator('#reg-confirm').fill('Fixture123!');
    await page.locator('.auth-form .submit-btn').click();
    await page.locator('.cd-dialog').waitFor();
    assert.equal(registered.accountType,type);
    await page.locator('.cd-digits input').first().fill('123456');
    await page.waitForURL(`**/${type==='Owner'?'upload-apartment':'discover'}`);
    assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('user'))).roles,['User',type]);
    checked++;await context.close();
  }
  console.log(`Passed ${checked} registration scenarios: both account choices, three languages, three widths, submitted role and post-verification destination.`);
} finally {await browser.close();}
