// Isolated website flow: synthetic device reports/accounts, no live commands.
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname } = require('node:path');
const { chromium } = require('playwright');
const webRoot = resolve(__dirname, '../web');
const mock = `
window.captureWrites=[]; window.captureRole='authorized'; window.captureVersion=1; window.captureOnline=true; window.captureAccess=true;
const devices=()=>window.captureAccess?[{id:'01',name:'Room 301',provisioned:true,temperature_c:28,humidity_pct:60,last_seen_at:window.captureOnline?new Date().toISOString():'2020-01-01',capture_test_version:window.captureVersion}]:[];
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
    browser = await chromium.launch({ executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true });
    const page = await browser.newPage();
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
    await assert.rejects(page.getByRole('spinbutton').waitFor({ timeout:100 }));
    for (const action of ['test_temp_down','test_temp_up','test_mode','test_powerful']) {
      await page.locator('.capture-test[data-action="'+action+'"]').click();
      await page.waitForFunction(action => window.captureWrites.some(write => write.value.action === action), action);
    }
    assert.deepEqual(await page.evaluate(()=>window.captureWrites.map(w=>w.value)), ['test_temp_down','test_temp_up','test_mode','test_powerful'].map(action=>({device_id:'01',requested_by:'member',action})));
    assert.match(await page.locator('#capture-status-01').innerText(), /no target temperature is confirmed/);
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
    assert.equal(await page.locator('.capture-test:not(:disabled)').count(),4);
    for (const width of [390,1440]) {
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
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
