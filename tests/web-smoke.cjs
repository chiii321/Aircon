// Run with Playwright and @axe-core/playwright available via NODE_PATH.
// BASE_URL must point to a local static server. No live accounts or devices are used.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:8765';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));

const mock = `
window.testWrites = [];
window.testRole = 'admin';
window.testError = false;
window.testEmpty = false;
window.testHold = false;
window.testSession = location.pathname.endsWith('dashboard.html');
const user = {id:'test-user',email:'room.operator@example.test'};
const session = () => window.testSession ? {user} : null;
const devices = () => window.testEmpty || (window.testExpiry && Date.now() >= Date.parse(window.testExpiry)) ? [] : [
  {id:'esp32-01',name:'Classroom 01',model:'AUX',provisioned:true,last_seen_at:new Date().toISOString(),temperature_c:28.6,humidity_pct:64.2,schedule_hold:window.testHold},
  {id:'esp32-02',name:'Classroom 02',model:'AUX',provisioned:true,last_seen_at:'2026-01-01T00:00:00Z',temperature_c:27,humidity_pct:65},
  {id:'esp32-03',name:'Laboratory',provisioned:false}
];
export function createClient() {
  return {
    auth: {
      getSession:async()=>({data:{session:session()}}),
      onAuthStateChange:()=>{},
      signOut:async()=>{window.testSession=false;return {error:null}},
      signInWithPassword:async()=>({error:{message:'Invalid login credentials'}}),
      signUp:async()=>({data:{},error:null})
    },
    rpc:async(name,args)=> {
      if(window.testError) throw new Error('Connection unavailable');
      if(name==='get_my_access_context') return {data:{role:window.testRole,deviceIds:devices().map(device=>device.id),accessMode:'weekly',serverTime:new Date().toISOString(),expiresAt:window.testExpiry && Date.now()<Date.parse(window.testExpiry) ? window.testExpiry : null}};
      if(name==='admin_list_users') return {data:[{id:'test-member',email:'member@example.test',role:'authorized',deviceIds:['esp32-01']}]};
      if(name==='respond_to_schedule_confirmation') window.testHold=false;
      window.testWrites.push({name,args});return {data:null,error:null};
    },
    from(table) {
      const q = {
        select(){return q},order(){return q},limit(){return q},eq(){return q},
        insert(value){window.testWrites.push({table,action:'insert',value});return q},
        update(value){window.testWrites.push({table,action:'update',value});return q},
        delete(){window.testWrites.push({table,action:'delete'});return q},
        then(resolve,reject) {
          const data = table==='devices' ? devices() : table==='device_schedules' ? [{id:1,device_id:'esp32-01',on_time:'07:00:00',off_time:'09:00:00',enabled:true}] : [];
          return Promise.resolve({data,error:null}).then(resolve,reject);
        }
      };return q;
    }
  };
}`;

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context = await browser.newContext();
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if(url.hostname === 'esm.sh') return route.fulfill({contentType:'application/javascript',body:mock});
    if(url.origin !== new URL(base).origin) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const check = async name => {
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name+' overflows');
    const result = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],name+' accessibility');
  };
  try {
    await page.emulateMedia({colorScheme:'dark'});
    await page.goto(base+'/index.html');
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    assert.equal(await page.locator('a[href="register.html"]').count(),0);
    await page.getByRole('button',{name:'Appearance: light',exact:true}).click();
    await page.getByRole('menuitemradio',{name:'Dark',exact:true}).click();
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await page.getByRole('button',{name:'Appearance: dark',exact:true}).click();
    await page.getByRole('menuitemradio',{name:'System',exact:true}).click();
    await page.emulateMedia({colorScheme:'light'});
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    await page.emulateMedia({colorScheme:'dark'});
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    await page.reload();
    assert.equal(await page.getByRole('button',{name:'Appearance: system',exact:true}).count(),1);
    await page.getByRole('button',{name:'Appearance: system',exact:true}).press('ArrowDown');
    await check('Appearance menu');
    await page.keyboard.press('End');
    assert.equal(await page.getByRole('menuitemradio',{name:'Dark',exact:true}).evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#theme-menu').isVisible(),false);
    await page.getByRole('button',{name:'Appearance: system',exact:true}).click();
    await page.getByRole('menuitemradio',{name:'Light',exact:true}).click();
    for (const colorScheme of ['light','dark']) {
      await page.emulateMedia({colorScheme});
      await page.evaluate(theme=>localStorage.setItem('inuvair-theme',theme),colorScheme);
      for (const width of [1440,390]) {
        await page.setViewportSize({width,height:1000});
        for (const file of ['index.html','login.html','register.html']) {
          await page.goto(base+'/'+file);
          await check(file+' '+colorScheme+' '+width);
          if(process.env.SHOTS_DIR) await page.screenshot({path:process.env.SHOTS_DIR+'/'+file+'-'+colorScheme+'-'+width+'.png',fullPage:true});
        }
        await page.goto(base+'/dashboard.html');
        await page.locator('#breadcrumb').waitFor();
        assert.equal(await page.locator('#breadcrumb').innerText(),'Overview');
        for (const route of ['overview','devices','monitoring','scheduling','history','alerts','user-access','settings','device/esp32-01']) {
          await page.evaluate(route=>{location.hash=route},route);
          await page.waitForTimeout(150);
          await check(route+' '+colorScheme+' '+width);
          if(route==='overview') {
            const action=page.locator('.overview-action').first();
            await action.hover();
            await check('Overview hovered card '+colorScheme+' '+width);
            assert.equal(await action.evaluate(el=>getComputedStyle(el).backgroundColor),await page.locator('.summary-icon').first().evaluate(el=>getComputedStyle(el).backgroundColor));
            await action.focus();
            await page.mouse.move(0,0);
            await check('Overview focused card '+colorScheme+' '+width);
            await action.evaluate(el=>el.blur());
          }
          if(process.env.SHOTS_DIR) await page.screenshot({path:process.env.SHOTS_DIR+'/'+route.replace('/','-')+'-'+colorScheme+'-'+width+'.png',fullPage:true});
        }
      }
    }
    await page.goto(base+'/dashboard.html#device/esp32-01');
    await page.getByRole('button',{name:'Turn on',exact:true}).click();
    await page.getByText('Command queued. Waiting for ESP32 acknowledgement.').waitFor();
    assert.equal(await page.evaluate(()=>window.testWrites[0].value.action),'on');
    await page.locator('#new-on').fill('08:00');
    await page.locator('#new-off').fill('10:00');
    await page.getByRole('button',{name:'Add window'}).click();
    await page.getByText('Use valid non-overlapping times, with OFF after ON.').waitFor();
    assert.equal(await page.evaluate(()=>window.testWrites.length),1);
    await page.locator('#new-on').fill('10:00');
    await page.locator('#new-off').fill('11:00');
    await page.getByRole('button',{name:'Add window'}).click();
    await page.getByText('Schedule saved. The ESP32 will sync it on its next poll.').waitFor();
    assert.equal(await page.evaluate(()=>window.testWrites[1].value.on_time),'10:00');
    await page.evaluate(()=>{location.hash='user-access'});
    assert.equal(await page.locator('.access-device-select').count(),0);
    await page.locator('.assigned-schedule > summary').click();
    await page.getByText('No room slots assigned. Upload a verified Excel timetable in Scheduling to grant access.',{exact:true}).waitFor();
    await page.evaluate(()=>{location.hash='settings'});
    await page.locator('#temperature-unit').selectOption('fahrenheit');
    await page.evaluate(()=>{location.hash='monitoring'});
    await page.getByText('83.5 °F',{exact:true}).waitFor();
    await page.evaluate(()=>{location.hash='settings'});
    await page.locator('#temperature-unit').selectOption('celsius');
    await page.evaluate(()=>{location.hash='user-access'});
    await page.getByLabel('Invitee email address').fill('invited@example.test');
    await page.getByRole('button',{name:'Create invite link'}).click();
    const invite = await page.getByLabel('Share this registration link').inputValue();
    assert.equal(new URL(invite).searchParams.get('email'),'invited@example.test');
    await page.evaluate(()=>{window.testRole='authorized';location.hash='overview'});
    await page.getByText('28.6 °C',{exact:true}).waitFor();
    assert.equal(await page.locator('[data-route]:visible').count(),2);
    assert.equal(await page.locator('[data-route="user-access"]').isVisible(),false);
    await page.evaluate(()=>{location.hash='user-access'});
    await page.waitForFunction(()=>location.hash==='#overview');
    assert.equal(await page.locator('#invite-form').count(),0);
    assert.equal(await page.getByText('Controls & schedule →',{exact:true}).count(),0);
    await page.evaluate(()=>{window.testExpiry=new Date(Date.now()+1500).toISOString();location.hash='alerts'});
    await page.getByRole('heading',{name:'Notifications',exact:true}).waitFor();
    await page.getByRole('heading',{name:'Notification feed',exact:true}).waitFor();
    assert.equal(await page.locator('.device-table').count(),0);
    assert.equal(await page.locator('.alert-list').getByText('Laboratory',{exact:false}).count(),0);
    await page.evaluate(()=>{location.hash='overview'});
    await page.getByText('28.6 °C',{exact:true}).waitFor();
    await page.getByText('28.6 °C',{exact:true}).waitFor({state:'hidden',timeout:5000});
    await page.evaluate(()=>{window.testExpiry=null});
    await page.evaluate(()=>{window.testHold=true;location.hash='alerts'});
    await page.getByRole('heading',{name:'Notifications',exact:true}).waitFor();
    await page.evaluate(()=>{location.hash='overview'});
    await page.getByRole('button',{name:'Resume schedules'}).click();
    await page.getByRole('button',{name:'Resume schedules'}).waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.testWrites.at(-1).name),'respond_to_schedule_confirmation');
    await page.evaluate(()=>{window.testEmpty=true;location.hash='alerts'});
    await page.getByText('No rooms are assigned to you at this time.',{exact:true}).waitFor();
    await page.evaluate(()=>{window.testRole='pending';location.hash='overview'});
    await page.getByRole('heading',{name:'Awaiting admin approval'}).waitFor();
    await page.evaluate(()=>{window.testError=true;location.hash='alerts'});
    await page.getByRole('button',{name:'Try again'}).waitFor();
    await page.evaluate(()=>{window.testError=false;window.testRole='admin'});
    await page.getByRole('button',{name:'Try again'}).click();
    await page.getByRole('heading',{name:'Notifications',exact:true}).waitFor();
    await page.goto(base+'/login.html');
    await page.getByLabel('Email address').fill('test@example.test');
    await page.getByLabel('Password').fill('test-password');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByText('Invalid login credentials',{exact:true}).waitFor();
    assert.equal(await page.locator('a[href="register.html"]').count(),0);
    await page.goto(invite);
    assert.equal(await page.getByLabel('Email address').inputValue(),'invited@example.test');
    assert.equal(await page.getByLabel('Email address').getAttribute('readonly'),'');
    await page.getByLabel('Password').fill('test-password');
    await page.getByRole('button',{name:'Create account',exact:true}).click();
    await page.getByText('Check your inbox to confirm your email, then sign in.',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('PASS: 48 responsive/theme views, axe checks, role visibility, mocked commands/schedules, edit retention, loading errors, login and registration.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
