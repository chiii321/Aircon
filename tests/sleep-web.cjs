// Synthetic device reports only; no real account or device writes.
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const serveWeb = require('./serve-web.cjs')
if (process.env.BASE_URL) assert(['localhost', '127.0.0.1'].includes(new URL(process.env.BASE_URL).hostname))
const mock = `
const session = {user:{id:'test-admin',email:'admin@example.test'}};
window.testMode = 'sleeping'; window.testWrites = [];
window.testIr = null; window.testCommand = null;
const devices = () => [{id:'01',name:'Room 301',provisioned:true,temperature_c:28.6,humidity_pct:64.2,
  last_ir_action:window.testIr,last_ir_at:window.testIr ? new Date(Date.now()-60000).toISOString() : null,
  last_seen_at:new Date(Date.now()-(['online','idle','unknown'].includes(window.testMode) ? 0 : 60000)).toISOString(),
  power_mode:window.testMode==='online' ? 'active' : ['idle','offline'].includes(window.testMode) ? 'modem_sleep' : null,
  sleep_until:window.testMode==='sleeping' ? new Date(Date.now()+3600000).toISOString() : null}];
export function createClient() { return {
  auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>{},signOut:async()=>({})},
  rpc:async name=>({data:name==='get_my_access_context' ? {role:'admin',deviceIds:['01']} : []}),
  from(table) { const q = {
    select(){return q},eq(){return q},order(){return q},limit(){return q},
    maybeSingle:async()=>({data:{username:'test',first_name:'Test',last_name:'Admin'}}),
    insert(value){window.testWrites.push({table,value});return q},
    then(resolve,reject){return Promise.resolve({data:table==='devices' ? devices() : table==='device_commands' && window.testCommand ? [window.testCommand] : [],error:null}).then(resolve,reject)}
  };return q;}
};}
`
;(async () => {
  const server = process.env.BASE_URL ? null : await serveWeb()
  const base = process.env.BASE_URL || server.base
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true})
  try {
    const context = await browser.newContext()
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.hostname === 'esm.sh') return route.fulfill({contentType:'application/javascript',body:mock})
      if (url.origin !== new URL(base).origin) return route.abort()
      return route.continue()
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    for (const theme of ['light','dark']) for (const width of [1440,390]) {
      await page.setViewportSize({width,height:1000})
      await page.goto(base+'/dashboard.html#device/01')
      await page.evaluate(theme => { localStorage.setItem('inuvair-theme',theme) },theme)
      await page.reload()
      await page.getByText('Sleeping',{exact:true}).waitFor()
      assert.equal(await page.getByRole('button',{name:'Power on',exact:true}).isDisabled(),true)
      assert.equal(await page.getByRole('button',{name:'Power off',exact:true}).isDisabled(),true)
      await page.getByText('28.6 °C',{exact:true}).waitFor()
      await page.getByText(/Last reported readings · expected wake:/).waitFor()
      assert.equal(await page.locator('.reading').filter({has:page.getByText('AC state (estimated)',{exact:true})}).locator('b').innerText(),'Unknown')
      assert.equal(await page.evaluate(()=>window.testWrites.length),0)
      await page.evaluate(()=>location.hash='overview')
      await page.getByText('No notifications.',{exact:true}).waitFor()
      await page.evaluate(()=>location.hash='settings')
      await page.getByRole('heading',{name:'Profile',exact:true}).waitFor()
      assert.equal(await page.getByRole('heading',{name:'INUVAIR power and sleep'}).count(),0)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false)
      if (process.env.SHOTS_DIR) await page.screenshot({path:process.env.SHOTS_DIR+'/sleep-settings-'+theme+'-'+width+'.png',fullPage:true})
      await page.evaluate(()=>{window.testMode='idle';window.testIr='on';location.hash='device/01'})
      await page.getByText('Idle sleep · online',{exact:true}).waitFor()
      await page.getByText('28.6 °C',{exact:true}).waitFor()
      assert.equal(await page.locator('.reading').filter({has:page.getByText('AC state (estimated)',{exact:true})}).locator('b').innerText(),'ON')
      assert.equal(await page.getByRole('button',{name:'Power on',exact:true}).isDisabled(),false)
      assert.equal(await page.getByRole('button',{name:'Power off',exact:true}).isDisabled(),false)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false)
      if (process.env.SHOTS_DIR) await page.screenshot({path:process.env.SHOTS_DIR+'/idle-status-'+theme+'-'+width+'.png',fullPage:true})
      await page.evaluate(()=>location.hash='overview')
      await page.getByText('No notifications.',{exact:true}).waitFor()
      await page.evaluate(()=>{window.testMode='offline';location.hash='device/01'})
      await page.getByText('Offline',{exact:true}).waitFor()
      assert.equal(await page.getByText(/Last reported readings · expected wake:/).count(),0)
      assert.equal(await page.getByText('Idle sleep · online',{exact:true}).count(),0)
      await page.evaluate(()=>{window.testIr=null})
    }
    await page.evaluate(()=>{window.testMode='unknown';location.hash='overview'})
    await page.evaluate(()=>location.hash='device/01')
    await page.getByText('Online',{exact:true}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Power on',exact:true}).isDisabled(),false)
    await page.evaluate(()=>{window.testMode='idle';location.hash='overview'})
    await page.evaluate(()=>location.hash='device/01')
    await page.getByText('Idle sleep · online',{exact:true}).waitFor()
    await page.locator('#new-on').fill('23:21')
    await page.locator('#new-off').fill('23:25')
    await page.getByRole('button',{name:'Add window',exact:true}).click()
    await page.getByText('Schedule saved.',{exact:true}).waitFor()
    const saved = await page.evaluate(()=>window.testWrites.find(write=>write.table==='device_schedules'))
    assert.equal(saved.value.on_time,'23:21')
    assert.equal(saved.value.off_time,'23:25')
    await page.evaluate(()=>{window.testMode='online';location.hash='overview'})
    await page.evaluate(()=>location.hash='device/01')
    await page.getByText('Online',{exact:true}).waitFor()
    for (const status of ['queued','failed']) {
      await page.evaluate(status=>{
        window.testIr='on';window.testCommand={id:1,device_id:'01',action:'off',status,error_message:status==='failed' ? 'Command expired before delivery' : null,expires_at:new Date(Date.now()+60000).toISOString()};location.hash='overview'
      },status)
      await page.evaluate(()=>location.hash='device/01')
      await page.getByText(status==='queued' ? 'Last request: OFF · Waiting for ESP32' : 'Last request: OFF · Command expired before delivery',{exact:true}).waitFor()
      assert.equal(await page.locator('.reading').filter({has:page.getByText('AC state (estimated)',{exact:true})}).locator('b').innerText(),'ON')
    }
    await page.evaluate(()=>{window.testIr='off';location.hash='overview'})
    await page.evaluate(()=>location.hash='device/01')
    assert.equal(await page.locator('.reading').filter({has:page.getByText('AC state (estimated)',{exact:true})}).locator('b').innerText(),'OFF')
    await page.evaluate(()=>location.hash='settings')
    await page.getByRole('heading',{name:'Profile',exact:true}).waitFor()
    assert.equal(await page.getByRole('heading',{name:'INUVAIR power and sleep'}).count(),0)
    assert.deepEqual(errors,[])
    console.log('Device UI passed: estimated ON/OFF/Unknown, queued/failed commands cannot override reports, sleep modes, controls and light/dark mobile/desktop layouts.')
  } finally { await browser.close(); await server?.close() }
})().catch(error=>{console.error(error);process.exitCode=1})
