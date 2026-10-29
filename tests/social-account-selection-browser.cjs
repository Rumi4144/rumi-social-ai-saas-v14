// Real posting controls with local account responses. No OAuth or social publication occurs.
const {chromium} = require('playwright');
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'social-account-selection-'));
let browser, server;

(async () => {
  fs.writeFileSync(path.join(out, 'entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import Schedule from ${JSON.stringify(repo+'/components/SchedulePostButton')};import ${JSON.stringify(repo+'/app/globals.css')};createRoot(document.getElementById('root')!).render(<><label>Reel caption<textarea defaultValue="My saved reel caption"/></label><Schedule contentItemId="post" initialStatus="approved" isVideo={location.pathname!=='/photo'} openByDefault allowPostNow/></>);`);
  await esbuild.build({entryPoints:[path.join(out, 'entry.tsx')], bundle:true, outfile:path.join(out, 'app.js'), nodePaths:[repo+'/node_modules'], jsx:'automatic', define:{'process.env.NODE_ENV':'"production"'}});
  const facebook = {id:'facebook', provider:'facebook', accountName:'Test Page'};
  const instagram = {id:'instagram', provider:'instagram', accountName:'rumiguitars1'};
  let accounts = [facebook], fail = false, delay = 0;
  const writes = [], unexpected = [], errors = []; let deliveries = [];
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    if (['/app.js','/app.css'].includes(url.pathname)) {
      res.setHeader('Content-Type', url.pathname.endsWith('css') ? 'text/css' : 'application/javascript');
      return res.end(fs.readFileSync(path.join(out, url.pathname.slice(1))));
    }
    res.setHeader('Content-Type','application/json');
    if (url.pathname === '/api/publishing/status') return res.end(JSON.stringify({jobs:deliveries}));
    if (url.pathname === '/api/content-items/post/x-caption') return res.end(JSON.stringify({contentItemId:'post',sourceText:'My saved reel caption',text:'My saved reel caption',hasMedia:true}));
    if (url.pathname === '/api/social/connections') {
      res.statusCode = fail ? 500 : 200;
      const body = JSON.stringify(fail ? {error:'Test account loading failed'} : {connections:accounts});
      return setTimeout(() => res.end(body), delay);
    }
    if (url.pathname === '/api/social/instagram/connect') {
      res.setHeader('Content-Type','text/html');
      return res.end('<p>Local connection fixture. No real sign-in.</p>');
    }
    if (url.pathname === '/api/publishing/schedule') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      writes.push(JSON.parse(Buffer.concat(chunks)));
      return res.end('{}');
    }
    if (url.pathname.startsWith('/api/')) {unexpected.push(url.pathname); res.statusCode=500; return res.end('{}');}
    res.setHeader('Content-Type','text/html');
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="public-page"><main id="root"></main><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch(require('./browser-launch.cjs')());
  const page = await browser.newPage({viewport:{width:390,height:844}});
  page.on('pageerror', error => errors.push(error.message));
  const base = 'http://127.0.0.1:' + server.address().port;
  await page.goto(base);
  const connect = page.getByRole('link', {name:'Connect Instagram', exact:true});
  await connect.waitFor();
  assert.equal(await connect.getAttribute('href'), '/api/social/instagram/connect');
  assert.equal(await connect.getAttribute('target'), '_blank');
  await page.getByLabel('Reel caption').fill('Keep this caption while connecting.');
  await page.getByRole('combobox', {name:/^When/}).selectOption('later');
  await page.locator('input[type=datetime-local]').fill('2099-01-01T12:00');
  const [popup] = await Promise.all([page.waitForEvent('popup'), connect.click()]);
  await popup.waitForLoadState();
  assert.ok(popup.url().endsWith('/api/social/instagram/connect'));
  await popup.close();
  accounts = [facebook, instagram]; delay = 1500;
  await page.getByRole('button', {name:'Refresh accounts', exact:true}).click();
  await page.getByRole('button', {name:'Loading accounts…', exact:true}).waitFor();
  assert.equal(await page.getByRole('button', {name:'Approve and schedule', exact:true}).isDisabled(), true);
  const ig = page.getByRole('checkbox', {name:'Instagram · rumiguitars1', exact:true});
  await ig.waitFor();
  assert.equal(await ig.isChecked(), false, 'A newly connected account must not be selected for publishing automatically');
  assert.equal(await page.getByRole('checkbox', {name:'facebook · Test Page', exact:true}).isChecked(), true);
  assert.equal(await page.getByLabel('Reel caption').inputValue(), 'Keep this caption while connecting.');
  assert.equal(await page.locator('input[type=datetime-local]').inputValue(), '2099-01-01T12:00');
  assert.equal(page.url(), base+'/');
  assert.equal(await connect.count(), 0);
  await ig.check();
  fail = true; delay = 0;
  await page.getByRole('button', {name:'Refresh accounts', exact:true}).click();
  await page.getByText('Test account loading failed', {exact:true}).waitFor();
  assert.equal(await ig.isChecked(), true, 'A failed refresh preserves existing choices');
  fail = false;
  accounts = [facebook];
  await page.getByRole('button', {name:'Refresh accounts', exact:true}).click();
  await connect.waitFor();
  accounts = [facebook, instagram];
  await page.getByRole('button', {name:'Refresh accounts', exact:true}).click();
  await ig.waitFor();
  assert.equal(await ig.isChecked(), false, 'A removed account must not retain its previous publishing selection');
  await ig.check();
  await page.getByRole('checkbox', {name:'facebook · Test Page', exact:true}).uncheck();
  assert.equal(writes.length, 0, 'Connection and refresh never submit the reel');
  await page.getByRole('button', {name:'Approve and schedule', exact:true}).click();
  await page.getByText('Submitted. Delivery status updates above.', {exact:true}).waitFor();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].socialConnectionIds, ['instagram']);
  assert.equal(writes[0].contentItemId, 'post');

  // Initial failures are retryable, and an empty list can acquire Instagram without reloading.
  fail = true; await page.goto(base+'/photo');
  await page.getByText('Test account loading failed', {exact:true}).waitFor();
  assert.equal(await connect.count(), 0, 'A failed initial load must not falsely report Instagram as disconnected');
  fail = false; accounts = [];
  await page.getByRole('button', {name:'Refresh accounts', exact:true}).click();
  await connect.waitFor();
  accounts = [instagram];
  await page.getByRole('button', {name:'Refresh accounts', exact:true}).click();
  await ig.waitFor();
  assert.equal(await ig.isChecked(), false);
  // X needs an explicit permission upgrade. Refreshing must preserve the reel and never post it.
  const x = {id:'x',provider:'x',accountName:'RumiGuitars1',status:'linked'};
  for (const pathname of ['/photo','/']) {
    accounts = [x]; deliveries = []; await page.goto(base+pathname);
    const enable = page.getByRole('link',{name:'Enable X posting',exact:true});
    await enable.waitFor();
    assert.equal(await enable.getAttribute('href'),'/settings/x');
    assert.equal(await enable.getAttribute('target'),'_blank');
    const xBox = page.getByRole('checkbox',{name:/X \(Twitter\)/});
    assert.equal(await xBox.isDisabled(),true);
    assert.equal(await xBox.isChecked(),false);
    await page.getByLabel('Reel caption').fill('Preserve my approved guitar.');
    accounts = [{...x,status:'connected'}];
    await page.getByRole('button',{name:'Refresh accounts',exact:true}).click();
    await page.waitForFunction(()=>!Array.from(document.querySelectorAll('a')).some(a=>a.textContent==='Enable X posting'));
    assert.equal(await xBox.isDisabled(),false);assert.equal(await xBox.isChecked(),false);
    assert.equal(await page.getByLabel('Reel caption').inputValue(),'Preserve my approved guitar.');
    await xBox.check();
    await page.getByLabel('Edit X caption').waitFor();
    await page.getByLabel('Edit X caption').fill('x'.repeat(281));
    assert.equal(await page.getByRole('button',{name:'Approve and post now',exact:true}).isDisabled(),true);
    await page.getByLabel('Edit X caption').fill('A reviewed guitar caption for X.');
    const before = writes.length;
    deliveries = [{id:'delivery',platform:'x',status:'published',scheduledFor:new Date().toISOString(),publishedAt:new Date().toISOString(),externalPostId:'123456',socialConnection:{accountName:'RumiGuitars1'}}];
    await page.getByRole('button',{name:'Approve and post now',exact:true}).click();
    const receipt = page.getByRole('link',{name:'View X post',exact:true});await receipt.waitFor();
    assert.equal(await receipt.getAttribute('href'),'https://x.com/i/status/123456');
    assert.equal(writes.length,before+1);assert.deepEqual(writes.at(-1).socialConnectionIds,['x']);
    assert.deepEqual(writes.at(-1).x,{text:'A reviewed guitar caption for X.',sourceText:'My saved reel caption',approved:true});
  }
  const evidence = process.env.SOCIAL_ACCOUNT_QA_DIR;
  if (evidence) {fs.mkdirSync(evidence, {recursive:true}); await page.screenshot({path:path.join(evidence, 'account-selection.png'), fullPage:true});}
  assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  console.log('PASS: Instagram connect in a new tab, refresh without losing caption/time/selections, explicit account choice, removed-account cleanup, retry after failures, and Instagram-only submission. X permission upgrade, explicit photo/video selection and published receipt links also passed. All endpoints were local fixtures.');
})().catch(error => {console.error(error); process.exitCode=1;}).finally(async () => {await browser?.close(); server?.close();});
