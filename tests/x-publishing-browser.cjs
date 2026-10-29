// Real Publishing Center controls; every API response is a local fixture.
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'x-publishing-browser-'));
let browser, server;

(async () => {
  fs.writeFileSync(path.join(out, 'entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import Actions from ${JSON.stringify(repo + '/app/publishing/PublishingActions')};import ${JSON.stringify(repo + '/app/globals.css')};createRoot(document.getElementById('root')!).render(location.pathname.startsWith('/youtube')?<article className="card" style={{maxWidth:430,margin:12}}><Actions contentItemId="post" connectionId="x" destination="X · @Rumiguitars1" existingDelivery={{status:'published',externalPostId:'123456'}}/><Actions contentItemId="post" connectionId="youtube" destination="YouTube · Rumi Guitars" existingDelivery={location.pathname.endsWith('/done')?{status:'published',externalPostId:'yt-video'}:undefined}/></article>:<Actions contentItemId="post" connectionId="x" destination="X · @Rumiguitars1"/>);`);
  await esbuild.build({ entryPoints: [path.join(out, 'entry.tsx')], bundle: true, outfile: path.join(out, 'app.js'), nodePaths: [repo + '/node_modules'], jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const writes = [], errors = [], unexpected = [];
  const sourceCaption = 'Meet Rumi Guitars. ' + 'Longer details for other social platforms. '.repeat(10);
  let code = 400, response = { submitted: false, error: 'Shorten this caption.' }, jobs = [], delay = 0;
  server = http.createServer(async (req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(fs.readFileSync(path.join(out, 'app.js'))); }
    if (req.url === '/app.css') { res.setHeader('Content-Type', 'text/css'); return res.end(fs.readFileSync(path.join(out, 'app.css'))); }
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/api/publishing/status?')) return res.end(JSON.stringify({ jobs }));
    if (req.url === '/api/content-items/post/x-caption') return res.end(JSON.stringify({ contentItemId:'post', sourceText:sourceCaption, text:'Meet Rumi Guitars. Explore the collection.', hasMedia:true }));
    if (['/api/publishing/now', '/api/publishing/schedule'].includes(req.url)) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      writes.push({ route: req.url, ...JSON.parse(Buffer.concat(chunks)) });
      res.statusCode = code;
      return setTimeout(() => res.end(JSON.stringify(response)), delay);
    }
    if (req.url.startsWith('/api/')) { unexpected.push(req.url); res.statusCode = 500; return res.end('{}'); }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch(require('./browser-launch.cjs')());
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const base = 'http://127.0.0.1:' + server.address().port;
  await page.goto(base);
  const publish = page.getByRole('button', { name: 'Approve and publish to X · @Rumiguitars1', exact: true });
  const receipt = page.getByRole('link', { name: 'View X post', exact: true });

  const xCaption = page.getByLabel('Edit X caption', {exact:true});
  await xCaption.waitFor();
  assert.equal(await xCaption.inputValue(),'Meet Rumi Guitars. Explore the collection.');
  await xCaption.fill('a'.repeat(281));
  assert.equal(await publish.isDisabled(),true);assert.equal(writes.length,0);
  await xCaption.fill('Reviewed caption for X.');
  await publish.click();
  await page.getByText('Not sent to X. Shorten this caption.', { exact: true }).waitFor();
  assert.equal(await publish.isEnabled(), true);
  assert.equal(await receipt.count(), 0);
  // An ambiguous provider failure must never claim the post was not sent.
  code = 502; response = { error: 'X did not confirm the result. Check your X profile.' };
  await publish.click();
  await page.getByText(response.error, { exact: true }).waitFor();
  assert.equal(await page.getByText(/Not sent to X/).count(), 0);
  assert.equal(await receipt.count(), 0);

  code = 200; response = { ok: true, externalPostId: '123456' }; delay = 500;
  await publish.click();
  await page.getByText('Sending your post to X…', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Working...' }).isDisabled(), true);
  await page.getByText('Posted to X.', { exact: true }).waitFor();
  assert.equal(await receipt.getAttribute('href'), 'https://x.com/i/status/123456');
  assert.equal(await publish.isDisabled(), true);
  assert.equal(writes.length, 3);
  assert.equal(writes.every(write => write.contentItemId === 'post' && write.socialConnectionId === 'x'), true);
  assert.ok(writes.every(write=>write.x.text==='Reviewed caption for X.' && write.x.sourceText===sourceCaption && write.x.approved===true));

  await page.goto(base);
  await page.clock.install();
  delay = 0; code = 202; response = { ok: true, pending: true, jobId: 'delivery' };
  jobs = [{ id: 'delivery', platform: 'x', status: 'retry', scheduledFor: new Date().toISOString(), lastError: 'X is processing the video.', socialConnection: { accountName: 'Rumiguitars1' } }];
  await publish.click();
  await page.getByText(/X is processing the video/).waitFor();
  assert.equal(await receipt.count(), 0);
  assert.equal(await page.getByText('Posted to X.', { exact: true }).count(), 0);
  jobs = [{ ...jobs[0], status: 'published', externalPostId: '654321', publishedAt: new Date().toISOString(), lastError: null }];
  await page.clock.fastForward(31000);
  await receipt.waitFor();
  assert.equal(await receipt.getAttribute('href'), 'https://x.com/i/status/654321');
  assert.equal(writes.length, 4, 'Polling a pending delivery must never submit another post');

  await page.goto(base);
  code = 400; response = { submitted: false, error: 'Shorten this caption.' }; jobs = [];
  await page.locator('input[type=datetime-local]').fill('2099-01-01T12:00');
  await page.getByRole('button', { name: 'Approve and schedule', exact: true }).click();
  await page.getByText('Not scheduled. Shorten this caption.', { exact: true }).waitFor();
  code = 201; response = { scheduled: 1 };
  jobs = [{ id: 'scheduled', platform: 'x', status: 'scheduled', scheduledFor: '2099-01-01T12:00:00Z', socialConnection: { accountName: 'Rumiguitars1' } }];
  await page.getByRole('button', { name: 'Approve and schedule', exact: true }).click();
  await page.getByText(/Schedule saved for/).waitFor();
  await page.getByText(/Scheduled ·/).waitFor();
  assert.equal(await receipt.count(), 0);
  assert.equal(writes.length, 6);
  assert.equal(writes.at(-1).route, '/api/publishing/schedule');
  assert.deepEqual(writes.at(-1).socialConnectionIds, ['x']);

  // The already posted X delivery stays visible while the same reel is available on YouTube.
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto(base + '/youtube');
  assert.equal(await page.getByRole('button', { name: 'Approve and publish to X · @Rumiguitars1' }).count(), 0);
  assert.equal(await receipt.getAttribute('href'), 'https://x.com/i/status/123456');
  const upload = page.getByRole('button', { name: 'Upload to YouTube · Rumi Guitars', exact: true });
  const kids = page.getByLabel('Made for kids', { exact: true });
  const synthetic = page.getByLabel('Realistic altered or synthetic content', { exact: true });
  const consent = page.getByLabel(/I authorize the upload/);
  assert.equal(await kids.isChecked(), false); assert.equal(await synthetic.isChecked(), true); assert.equal(await consent.isChecked(), false);
  await upload.click();
  await page.getByText('Confirm YouTube upload settings first.', { exact: true }).waitFor();
  assert.equal(writes.length, 6, 'Missing consent must not submit a request');
  const rows = await page.locator('label').evaluateAll(labels => labels.map(label => ({ top: label.getBoundingClientRect().top, bottom: label.getBoundingClientRect().bottom })));
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].top >= rows[i - 1].bottom, 'Each YouTube setting must have its own non-overlapping row');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (process.env.PUBLISHING_QA_DIR) {
    fs.mkdirSync(process.env.PUBLISHING_QA_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.PUBLISHING_QA_DIR, 'youtube-settings-mobile.png'), fullPage: true });
  }
  await page.getByLabel('Visibility', { exact: true }).selectOption('unlisted');
  await consent.check();
  code = 200; response = { ok: true, externalPostId: 'yt-video' }; delay = 0;
  await upload.click();
  await page.getByText('Uploaded to YouTube.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'View YouTube video' }).getAttribute('href'), 'https://www.youtube.com/watch?v=yt-video');
  assert.equal(writes.length, 7); assert.equal(writes.at(-1).socialConnectionId, 'youtube');
  assert.deepEqual(writes.at(-1).youtube, { certified: true, privacy: 'unlisted', madeForKids: false, containsSyntheticMedia: true });
  assert.equal(await upload.isDisabled(), true);
  await page.goto(base + '/youtube/done');
  assert.equal(await page.getByRole('button', { name: /Upload to YouTube/ }).count(), 0);
  assert.equal(await page.getByRole('link', { name: 'View YouTube video' }).getAttribute('href'), 'https://www.youtube.com/watch?v=yt-video');
  assert.equal(writes.length, 7, 'Refreshing completed deliveries must not post again');
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log('PASS: X delivery, receipts, scheduling and polling; YouTube after X, mobile settings, explicit consent, chosen settings and completed delivery protection. All requests used local fixtures.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close(); server?.close(); fs.rmSync(out, { recursive: true, force: true });
});
