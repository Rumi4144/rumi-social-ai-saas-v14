// Exercise the actual Settings controls against local fixtures; never contact Instagram.
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..'), out = fs.mkdtempSync(path.join(os.tmpdir(), 'instagram-controls-'));
let browser, server;
(async () => {
  fs.writeFileSync(path.join(out, 'entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import InstagramConnection from ${JSON.stringify(repo + '/app/settings/InstagramConnection')};import ${JSON.stringify(repo + '/app/globals.css')};createRoot(document.getElementById('root')!).render(<section className="card"><h2>Instagram Business</h2><InstagramConnection connectionId="own-ig" accountName="rumiguitars1" canManage={location.pathname!=='/viewer'}/></section>);`);
  await esbuild.build({ entryPoints: [path.join(out, 'entry.tsx')], bundle: true, outfile: path.join(out, 'app.js'), nodePaths: [repo + '/node_modules'], jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  let health = { ok: false, message: 'Instagram access has expired or was removed. Choose Reconnect Instagram.' }, checks = 0;
  const writes = [], errors = [], unexpected = [];
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    if (['/app.js', '/app.css'].includes(url.pathname)) { res.setHeader('Content-Type', url.pathname.endsWith('css') ? 'text/css' : 'application/javascript'); return res.end(fs.readFileSync(path.join(out, url.pathname.slice(1)))); }
    if (url.pathname === '/api/social/instagram/status') { checks++; assert.equal(url.searchParams.get('connectionId'), 'own-ig'); res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(health)); }
    if (url.pathname === '/api/social/instagram/disconnect') { const chunks = []; for await (const chunk of req) chunks.push(chunk); writes.push({ method: req.method, body: Buffer.concat(chunks).toString() }); return res.end('Local disconnect accepted'); }
    if (url.pathname.startsWith('/api/')) { unexpected.push(url.pathname); res.statusCode = 500; return res.end('Unexpected request'); }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="public-page"><main id="root" style="max-width:600px;padding:12px"></main><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch(require('./browser-launch.cjs')());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', error => errors.push(error.message));
  const base = 'http://127.0.0.1:' + server.address().port;
  await page.goto(base);
  await page.getByRole('button', { name: 'Check connection', exact: true }).click();
  await page.getByRole('status').filter({ hasText: /expired/ }).waitFor();
  assert.equal(checks, 1); assert.equal(writes.length, 0);
  assert.equal(await page.getByRole('link', { name: 'Reconnect Instagram', exact: true }).getAttribute('href'), '/api/social/instagram/connect?connectionId=own-ig');
  health = { ok: true, message: 'Instagram account access confirmed. Each post still needs a finished image or reel and Instagram publishing permission.' };
  await page.getByRole('button', { name: 'Check connection', exact: true }).click();
  await page.getByRole('status').filter({ hasText: /access confirmed/ }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(out, 'instagram-mobile.png'), fullPage: true });
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Disconnect Instagram', exact: true }).click();
  assert.equal(writes.length, 0);
  page.once('dialog', dialog => { assert.match(dialog.message(), /history remain/); dialog.accept(); });
  await Promise.all([page.waitForURL('**/api/social/instagram/disconnect'), page.getByRole('button', { name: 'Disconnect Instagram', exact: true }).click()]);
  assert.deepEqual(writes, [{ method: 'POST', body: 'connectionId=own-ig' }]);
  await page.goto(base + '/viewer');
  await page.getByRole('button', { name: 'Check connection', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Reconnect Instagram', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Disconnect Instagram', exact: true }).count(), 0);
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('PASS: Instagram connection check, retry, reconnect target, mobile layout, disconnect confirmation, and viewer controls. Local fixtures only. Evidence: ' + out);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server?.close(); });
