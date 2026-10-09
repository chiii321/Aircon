// Synthetic controller reports; no real accounts or device writes.
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const serveWeb = require('./serve-web.cjs')
const mock = `
const session={user:{id:'test-admin',email:'admin@example.test'}};
window.testReport={mode:'online',action:'on',temperature:null,humidity:null};
window.testCommand=null;window.testPolls=0;window.testWrites=[];
export function createClient(){return {
  auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>{}},
  rpc:async name=>({data:name==='get_my_access_context'?{role:'admin',deviceIds:['01']}:[]}),
  from(table){const q={
    select(){return q},eq(){return q},order(){return q},limit(){return q},
    maybeSingle:async()=>({data:{username:'test',first_name:'Test',last_name:'Admin'}}),
    insert(value){window.testWrites.push({table,value});window.testCommand={...value,id:1,status:'queued',expires_at:new Date(Date.now()+60000).toISOString()};return q},
    then(resolve,reject){
      const r=window.testReport;
      if(table==='devices')window.testPolls++;
      const data=table==='devices'?[{id:'01',name:'Room 301',provisioned:true,
        last_seen_at:new Date(Date.now()-(r.mode==='offline'?60000:0)).toISOString(),
        power_mode:r.mode==='idle'?'modem_sleep':'active',temperature_c:r.temperature,humidity_pct:r.humidity,
        last_ir_action:r.action,last_ir_at:new Date(Date.now()-1000).toISOString()}]
        :table==='device_commands'&&window.testCommand?[window.testCommand]:[];
      return Promise.resolve({data,error:null}).then(resolve,reject)
    }
  };return q}
}}
`
;(async()=>{
  const server=await serveWeb()
  const base=server.base
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true})
  try {
    const context=await browser.newContext({viewport:{width:390,height:1000}})
    await context.route('**/*',route=>{
      const url=new URL(route.request().url())
      if(url.hostname==='esm.sh')return route.fulfill({contentType:'application/javascript',body:mock})
      if(url.origin!==base)return route.abort()
      return route.continue()
    })
    const page=await context.newPage()
    page.setDefaultTimeout(3500)
    const errors=[]
    page.on('pageerror',error=>errors.push(error.message))
    await page.clock.install()
    await page.goto(base+'/dashboard.html#device/01')
    await page.getByText('Online',{exact:true}).waitFor()
    const input=page.locator('#new-on')
    const state=page.locator('.reading').filter({has:page.getByText('AC state (estimated)',{exact:true})}).locator('b')
    await input.fill('06:17')
    await page.evaluate(()=>{window.testReport={mode:'idle',action:'off',temperature:29.4,humidity:72.1}})
    await page.clock.runFor(8000)
    await page.getByText('Idle sleep · online',{exact:true}).waitFor()
    assert.equal(await state.innerText(),'OFF')
    await page.getByText('29.4 °C',{exact:true}).waitFor()
    await page.getByText('72.1 %',{exact:true}).waitFor()
    assert.equal(await input.inputValue(),'06:17')
    assert.equal(await page.evaluate(()=>document.activeElement.id),'new-on')
    await page.evaluate(()=>{window.testReport.mode='offline'})
    await page.clock.runFor(8000)
    await page.getByText('Offline',{exact:true}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Power on',exact:true}).isDisabled(),true)
    assert.equal(await input.inputValue(),'06:17')
    await page.evaluate(()=>{window.testReport={mode:'online',action:'off',temperature:null,humidity:null}})
    await page.clock.runFor(8000)
    await page.getByText('Online',{exact:true}).waitFor()
    await page.getByRole('button',{name:'Power on',exact:true}).click()
    await page.getByText('Command queued. Waiting for ESP32 acknowledgement.',{exact:true}).waitFor()
    assert.equal(await input.inputValue(),'06:17')
    await page.evaluate(()=>{window.testReport={mode:'online',action:'on',temperature:25.2,humidity:75.9};window.testCommand.status='sent_ir'})
    await page.clock.runFor(8000)
    await page.getByText('Last request: ON · IR sent by ESP32',{exact:true}).waitFor()
    assert.equal(await state.innerText(),'ON')
    await page.getByText('25.2 °C',{exact:true}).waitFor()
    await page.getByText('75.9 %',{exact:true}).waitFor()
    assert.equal(await input.inputValue(),'06:17')
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    assert.deepEqual(errors,[])
    console.log('Live refresh passed without reload/navigation: idle/offline/online, ON/OFF acknowledgement, sensor arrival and preserved schedule value/focus.')
  } finally {await browser.close();await server.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
