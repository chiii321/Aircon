// Uses a local static server and mocked Supabase; no real accounts or AC commands.
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:8879';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));

(async () => {
  const mod = await import(pathToFileURL(path.resolve('web/schedule-import.js')));
  const XLSX = await import(pathToFileURL(path.resolve('web/vendor/xlsx-0.20.3.mjs')));
  const users = [{ email: 'member@example.test', role: 'authorized' }];
  const row = ['member@example.test', '301', 'Monday', '07:00', '09:00', 'Class'];
  assert.equal(mod.parseScheduleRows([mod.HEADERS, row], users).errors.length, 0);
  assert.equal(mod.timeText(7 / 24), '07:00');
  assert.equal(mod.timeText('7:00'), '07:00');
  assert.equal(mod.timeText('25:00'), '');
  assert.equal(mod.timeText(7 / 24 + 1 / 86400), '');
  assert(mod.parseScheduleRows([mod.HEADERS, row, ['member@example.test','306','Monday','08:00','10:00','']], users).errors.some(x => x.includes('overlapping')));
  assert.equal(mod.parseScheduleRows([mod.HEADERS, row, ['member@example.test','306','Monday','09:00','10:00','']], users).errors.length, 0);
  assert(mod.parseScheduleRows([mod.HEADERS, ['unknown@example.test','301','Monday','07:00','09:00','']], users).errors.length);
  const stray = mod.parseScheduleRows([mod.HEADERS, [...row, 'accidental cell']], users);
  assert.equal(stray.rows.length, 0); assert(stray.errors.length);
  const broken = mod.parseScheduleRows([mod.HEADERS, [...row.slice(0,5),'broken\ufffdtext']], users);
  assert.equal(broken.rows.length, 0); assert(broken.errors.length);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([mod.HEADERS,row,['member@example.test','306','Monday',11 / 24,13 / 24,'Class 2']]), 'Schedule');
  const fileBuffer = Buffer.from(XLSX.write(book, {type:'buffer', bookType:'xlsx'}));
  const file = { name:'schedule.xlsx',size:fileBuffer.length,arrayBuffer:async()=>fileBuffer };
  assert.equal((await mod.readScheduleFile(file, users)).rows[1].end, '13:00');
  book.Sheets.Schedule.D2 = {t:'n',v:7/24,f:'TIME(7,0,0)'};
  const formulaBuffer = Buffer.from(XLSX.write(book, {type:'buffer',bookType:'xlsx'}));
  await assert.rejects(mod.readScheduleFile({...file,arrayBuffer:async()=>formulaBuffer}, users), /Formulas/);

  const mock = `export function createClient(){const devices=[{id:'01',name:'ESP32 01',provisioned:false},{id:'02',name:'ESP32 02',provisioned:false}];return {auth:{getSession:async()=>({data:{session:{user:{id:'admin',email:'admin@example.test'}}}}),onAuthStateChange:()=>{}},rpc:async(name,args)=>{if(name==='get_my_access_context')return {data:{role:window.testRole||'admin'}};if(name==='admin_list_users')return {data:[{email:'member@example.test',role:'authorized',id:'member',deviceIds:[]}]};if(name==='admin_import_weekly_bookings'){window.savedBookings=args.bookings;return {data:{added:args.bookings.length,skipped:0}}}return {data:null}},from:table=>{const q={select:()=>q,order:()=>q,eq:()=>q,limit:()=>q,then:(resolve,reject)=>Promise.resolve({data:table==='devices'?devices:[],error:null}).then(resolve,reject)};return q}}}`;
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if(url.hostname==='esm.sh')return route.fulfill({contentType:'application/javascript',body:mock});
      if(url.origin!==new URL(base).origin)return route.abort();
      return route.continue();
    });
    await page.goto(base+'/dashboard.html#scheduling');
    await page.locator('#schedule-file').waitFor();
    assert.equal((await page.request.get(base+'/templates/inuvair-weekly-room-schedule-template.xlsx')).status(),200);
    await page.locator('#schedule-file').setInputFiles({name:'schedule.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:fileBuffer});
    await page.locator('#save-import').waitFor();
    await page.locator('#save-import').click();
    await page.getByText('Choose a controller for every room.',{exact:true}).waitFor();
    await page.locator('#map-room-301').selectOption('01');
    await page.locator('#map-room-306').selectOption('02');
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'upload preview overflows');
      const a11y = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      assert.deepEqual(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
    }
    await page.locator('#save-import').click();
    await page.locator('#confirm-import').waitFor();
    assert.equal(await page.evaluate(()=>window.savedBookings),undefined);
    await page.locator('#cancel-import').click();
    assert.equal(await page.evaluate(()=>window.savedBookings),undefined);
    await page.locator('#save-import').click();
    for (const theme of ['light','dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme);
      const dialogA11y = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      assert.deepEqual(dialogA11y.violations.map(v=>v.id),[]);
    }
    await page.locator('#confirm-import').click();
    await page.getByText('2 bookings saved; 0 duplicates skipped.',{exact:true}).waitFor();
    const saved = await page.evaluate(()=>window.savedBookings);
    assert.equal(saved[0].device_id,'01'); assert.equal(saved[1].end_time,'13:00');
    book.Sheets.Schedule.D2 = {t:'n',v:7/24};
    book.Sheets.Schedule.G2 = {t:'s',v:'accidental extra text'};
    book.Sheets.Schedule['!ref'] = 'A1:G3';
    const strayBuffer = Buffer.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
    await page.locator('#schedule-file').setInputFiles({name:'stray.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:strayBuffer});
    await page.locator('.import-errors').waitFor();
    assert.equal(await page.locator('#save-import').isDisabled(),true);
    assert.equal(await page.getByText('accidental extra text',{exact:true}).count(),0);
    await page.locator('#schedule-file').setInputFiles({name:'formula.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:formulaBuffer});
    await page.getByText('Use plain values in the Schedule sheet. Formulas are not accepted.',{exact:true}).waitFor();
    await page.evaluate(()=>{window.testRole='authorized';location.hash='overview'});
    await page.waitForTimeout(200);
    assert.equal(await page.locator('[data-route=scheduling]').isVisible(),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: Excel parsing, times, overlaps, formulas, mapping, save payload, mobile/accessibility, and authorized navigation.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
