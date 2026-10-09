// Isolated website flow: synthetic device reports/accounts, no live commands.
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname } = require('node:path');
const { chromium, webkit } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const webRoot = resolve(__dirname, '../web');
const mock = `
window.captureWrites=[]; window.captureRole='authorized'; window.captureVersion=1; window.captureOnline=true; window.captureAccess=true;
const devices=()=>window.captureAccess?[{id:'01',name:'Room 301',provisioned:true,temperature_c:28,humidity_pct:60,wifi_rssi:window.captureRssi ?? null,last_seen_at:window.captureOnline?new Date().toISOString():'2020-01-01',capture_test_version:window.captureVersion}]:[];
export function createClient(){return {
 auth:{getSession:async()=>({data:{session:{user:{id:'member',email:'member@example.test'}}}}),onAuthStateChange:()=>{}},
 rpc:async(name)=>({data:name==='get_my_access_context'?{role:window.captureRole,deviceIds:devices().map(d=>d.id)}:[]}),
 from:table=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:null}),
 insert:value=>{window.captureWrites.push({table,value});return q},
 then:(ok,bad)=>Promise.resolve({data:table==='devices'?devices():[],error:null}).then(ok,bad)};return q}
}}`;

(async () => {
  const server = createServer(async (request, response) => {
    const file = resolve(webRoot, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(webRoot + require('node:path').sep)) { response.writeHead(404).end(); return; }
    try {
      const content = await readFile(file);
      response.setHeader('content-type', { '.js':'application/javascript', '.html':'text/html', '.css':'text/css', '.svg':'image/svg+xml' }[extname(file)] || 'application/octet-stream');
      response.end(content);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = process.env.TEST_WEBKIT ? await webkit.launch({headless:true}) : await chromium.launch({ executablePath:process.env.CHROME_PATH || undefined, headless:true });
    const page = await (await browser.newContext()).newPage();
    await page.addInitScript(() => {
      const interval = window.setInterval;
      window.setInterval = (callback, delay, ...args) => {
        if (delay === 8000) window.refreshForScrollTest = callback;
        return interval(callback, delay, ...args);
      };
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'esm.sh') return route.fulfill({ contentType:'application/javascript', body:mock });
      if (url.origin !== base) return route.abort();
      return route.continue();
    });
    await page.goto(base + '/dashboard.html#overview');
    await page.locator('.capture-test').first().waitFor();
    assert.equal(await page.locator('.capture-test').count(), 4);
    assert.equal(await page.locator('.manual').count(), 0);
    assert.equal(await page.locator('.room-remote').count(), 1);
    assert.equal(await page.locator('.assigned-room .capture-test, .assigned-room .ac-setting-indicators').count(), 0);
    assert.equal(await page.locator('.device-control-card .capture-test').count(), 4);
    assert.match(await page.locator('.device-control-card h2').innerText(), /Room 301/);
    assert.deepEqual(await page.locator('.ac-setting-indicators strong').allTextContents(), ['Unknown', 'Unknown']);
    assert.match(await page.locator('.assigned-room .reading').first().innerText(), /Room temperature/i);
    assert.match(await page.locator('.assigned-room .reading').first().innerText(), /28.0 °C/);
    for (const width of [390,1440]) {
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if (width === 1440) {
        const room = await page.locator('.assigned-room').boundingBox();
        const controls = await page.locator('.device-control-card').boundingBox();
        assert.ok(Math.abs(room.height - controls.height) < 2);
      }
      if (process.env.CAPTURE_SCREENSHOTS && await page.locator('.assigned-room').count()) await page.screenshot({path: 'outputs/remote-controls-'+width+'.png',fullPage:true});
    }
    await assert.rejects(page.getByRole('spinbutton').waitFor({ timeout:100 }));
    for (const action of ['test_temp_down','test_temp_up','test_mode','test_powerful']) {
      await page.locator('.capture-test[data-action="'+action+'"]').click();
      await page.waitForFunction(action => window.captureWrites.some(write => write.value.action === action), action);
    }
    assert.deepEqual(await page.evaluate(()=>window.captureWrites.map(w=>w.value)), ['test_temp_down','test_temp_up','test_mode','test_powerful'].map(action=>({device_id:'01',requested_by:'member',action})));
    assert.match(await page.locator('#capture-status-01').innerText(), /no target temperature is confirmed/);
    assert.deepEqual(await page.locator('.ac-setting-indicators strong').allTextContents(), ['Unknown', 'Unknown']);
    const refreshOverview = async changes => {
      await page.evaluate(changes => Object.assign(window, changes), changes);
      await page.evaluate(()=>{location.hash='alerts'});
      await page.waitForFunction(()=>document.getElementById('breadcrumb').textContent==='Notifications');
      await page.evaluate(()=>{location.hash='overview'});
      await page.locator('.capture-test').first().waitFor();
    };
    await refreshOverview({ captureVersion:null });
    assert.equal(await page.locator('.capture-test:disabled').count(),4);
    await refreshOverview({ captureVersion:1,captureOnline:false });
    assert.equal(await page.locator('.capture-test:disabled').count(),4);
    await refreshOverview({ captureOnline:true });
    await page.evaluate(()=>{window.captureRole='admin';location.hash='device/01'});
    await page.locator('.manual').first().waitFor();
    assert.equal(await page.locator('#climate-card .manual').count(), 2);
    assert.equal(await page.locator('#climate-card .capture-test').count(), 4);
    assert.equal(await page.locator('.device-control-card').count(), 0);
    assert.equal(await page.locator('.capture-test:not(:disabled)').count(),4);
    assert.equal(await page.locator('.dial-value').textContent(), '28.0 °C');
    assert.deepEqual(await page.locator('.stepper-readout strong, .climate-label strong').allTextContents(), ['Unknown', 'Unknown']);
    for (const width of [390,1440]) {
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const card = await page.locator('#climate-card').boundingBox();
      const reading = await page.locator('.climate-reading').boundingBox();
      const controls = await page.locator('.climate-controls').boundingBox();
      assert.ok(card.y + card.height <= (await page.locator('.device-timers-card').boundingBox()).y, 'Timers should follow the climate card');
      if (width === 1440) assert.ok(controls.x >= reading.x + reading.width - 1 && Math.abs(controls.y - reading.y) < 2, 'Desktop controls should sit beside the dial');
      else assert.ok(controls.y >= reading.y + reading.height - 1, 'Mobile controls should stack under the dial');
      for (const button of await page.locator('#climate-card button').all()) {
        const box = await button.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44, 'Climate control touch target is smaller than 44px');
      }
      for (const theme of ['light','dark']) {
        await page.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme);
        await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>animation instanceof CSSTransition).map(animation=>animation.finished.catch(()=>{}))));
        const a11y = await new AxeBuilder({page}).include('#climate-card').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        assert.deepEqual(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],`Climate card accessibility ${theme} ${width}`);
        if (process.env.CAPTURE_SCREENSHOTS) await page.locator('#climate-card').screenshot({path:`outputs/climate-card-${theme}-${width}.png`});
      }
      await page.evaluate(()=>{document.documentElement.dataset.theme='light'});
    }
    await page.setViewportSize({width:1440,height:500});
    await page.evaluate(()=>{ document.getElementById('screen').scrollTop=150; });
    const step = page.locator('.capture-test[data-action="test_temp_up"]');
    await step.scrollIntoViewIfNeeded();
    const stepBefore = await step.boundingBox();
    await step.hover();
    await page.waitForTimeout(200);
    assert.ok(Math.abs((await step.boundingBox()).y - stepBefore.y) < 1);
    await page.evaluate(()=>{document.getElementById('screen').scrollTop=150;});
    const beforeRefresh = await page.locator('#climate-card').boundingBox();
    const beforeScroll = await page.locator('#screen').evaluate(el=>el.scrollTop);
    assert.ok(beforeScroll > 0);
    await page.evaluate(()=>window.refreshForScrollTest());
    assert.equal(await page.locator('#screen').evaluate(el=>el.scrollTop), beforeScroll);
    assert.ok(Math.abs((await page.locator('#climate-card').boundingBox()).y - beforeRefresh.y) < 2);
    for (const width of [390,1440]) {
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if (width === 390) {
        const on = await page.locator('#new-on').boundingBox();
        const off = await page.locator('#new-off').boundingBox();
        const add = await page.locator('#add-schedule').boundingBox();
        assert.ok(off.y >= on.y + on.height && add.y >= off.y + off.height, 'Mobile timer fields overlap');
        assert.ok(Math.abs(add.width - on.width) < 2, 'Mobile timer button is not full width');
        assert.ok(Math.abs(add.x - on.x) < 2 && Math.abs(add.x - off.x) < 2 && Math.abs(add.width - off.width) < 2, 'Time inputs spill beyond the button edges');
      }
    }
    for (const [captureRssi, label] of [[-55, 'Excellent'], [-70, 'Good'], [-85, 'Poor'], [null, 'Not reported']]) {
      await refreshOverview({ captureRole:'authorized', captureRssi, captureOnline:true });
      assert.equal(await page.locator('.wifi-signal').getAttribute('aria-label'), `Wi-Fi: ${label}`);
    }
    await refreshOverview({ captureOnline:false });
    assert.equal(await page.locator('.wifi-signal').getAttribute('aria-label'), 'Wi-Fi: No connection');
    await page.evaluate(()=>{window.captureAccess=false;location.hash='overview'});
    await page.waitForFunction(()=>document.getElementById('breadcrumb').textContent==='Overview');
    await page.waitForFunction(()=>document.querySelectorAll('.capture-test').length===0);
    assert.deepEqual(errors,[]);
    console.log('PASS: authorized/admin test buttons, exact command payloads, legacy/offline gating, loss of room access, mobile overflow and no browser errors.');
  } finally {
    if (browser) await browser.close();
    await new Promise(ok => server.close(ok));
  }
})().catch(error=>{console.error(error);process.exitCode=1});
