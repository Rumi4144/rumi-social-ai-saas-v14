// Exercise the real Admin control without a live account or publishing provider.
const { chromium } = require('playwright'), esbuild = require('esbuild');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..'), out = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-date-'));
let server, browser, scheduledFor = '2026-10-26T12:00:00.000Z', failNext = false;
const requests = [], errors = [];
(async () => {
  fs.writeFileSync(path.join(out, 'entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import Editor from ${JSON.stringify(repo + '/components/DraftPlanDateEditor')};import ${JSON.stringify(repo + '/app/globals.css')};createRoot(document.getElementById('root')!).render(<Editor contentItemId="draft" scheduledFor={(window as any).draftDate}/>);`);
  await esbuild.build({ entryPoints: [path.join(out, 'entry.tsx')], bundle: true, outfile: path.join(out, 'app.js'), nodePaths: [repo + '/node_modules'], jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  server = http.createServer(async (req, res) => {
    if (['/app.js', '/app.css'].includes(req.url)) { res.setHeader('content-type', req.url.endsWith('.js') ? 'application/javascript' : 'text/css'); return res.end(fs.readFileSync(path.join(out, req.url.slice(1)))); }
    if (req.url.startsWith('/api/')) {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw || 'null'); requests.push({ path: req.url, method: req.method, body });
      res.setHeader('content-type', 'application/json');
      if (req.url !== '/api/content-items/draft/planned-date' || req.method !== 'PATCH') { res.statusCode = 500; return res.end('{}'); }
      if (failNext) { failNext = false; res.statusCode = 409; return res.end(JSON.stringify({ error: 'This draft changed. Refresh before editing it.' })); }
      assert.equal(body.expectedScheduledFor, scheduledFor);
      scheduledFor = body.plannedDate ? body.plannedDate + 'T12:00:00.000Z' : null;
      return res.end(JSON.stringify({ status: 200, scheduledFor, itemStatus: 'draft' }));
    }
    res.setHeader('content-type', 'text/html');
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="public-page"><main id="root"></main><script>window.draftDate=${JSON.stringify(scheduledFor)}</script><script src="/app.js"></script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch(require('./browser-launch.cjs')());
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } }); page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port);
  const open = () => page.getByRole('button', { name: 'Change draft date', exact: true }).click();
  await open(); assert.equal(await page.getByLabel('Planned date', { exact: true }).inputValue(), '2026-10-26');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); assert.equal(requests.length, 0);
  await open(); await page.getByRole('button', { name: 'Keep in Admin only', exact: true }).click();
  await page.getByRole('button', { name: 'Change draft date', exact: true }).waitFor();
  assert.equal(scheduledFor, null); assert.deepEqual(requests[0].body, { plannedDate: null, expectedScheduledFor: '2026-10-26T12:00:00.000Z' });
  await open(); assert.equal(await page.getByRole('button', { name: 'Keep in Admin only', exact: true }).count(), 0);
  assert.ok(await page.getByRole('button', { name: 'Save draft date', exact: true }).isDisabled());
  await page.getByLabel('Planned date', { exact: true }).fill('2026-11-01');
  await page.getByRole('button', { name: 'Save draft date', exact: true }).click(); await page.getByRole('button', { name: 'Change draft date', exact: true }).waitFor();
  assert.equal(scheduledFor, '2026-11-01T12:00:00.000Z');
  failNext = true; await open(); await page.getByRole('button', { name: 'Keep in Admin only', exact: true }).click(); await page.getByRole('alert').waitFor();
  assert.equal(scheduledFor, '2026-11-01T12:00:00.000Z'); assert.equal(requests.length, 3); assert.deepEqual(errors, []);
  assert.ok(requests.every(r => r.path.endsWith('/planned-date') && Object.keys(r.body).sort().join(',') === 'expectedScheduledFor,plannedDate'));
  console.log('PASS: Admin can cancel, retain a draft in Admin, reassign a date, and recover from a conflict without publishing or regenerating content.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server?.close(); });
