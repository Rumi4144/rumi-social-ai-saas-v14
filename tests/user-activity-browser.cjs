const { chromium } = require('playwright');
const esbuild = require('esbuild');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const assert = require('node:assert/strict');
const launch = require('./browser-launch.cjs');
const root = path.resolve(__dirname, '..'), output = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-activity-browser-'));
const sid = '9b9bc01c-a7f4-412b-b3dc-dd17938e97cf', checks = [], queries = [];
let browser, server, rejectCheck = false;
const now = '2026-10-26T18:00:00.000Z';
const row = (index, status) => ({
  id: String(index), userName: ['Alex Client', 'Sam Client', 'Taylor Client', 'Legacy Client'][index], email: `client${index}@example.com`,
  business: 'Sample Business', status, spanSeconds: 3660,
  session: { version: 1, signedInAt: index === 3 ? null : now, trackingStartedAt: now, lastSeenAt: now,
    lastActiveAt: now, activeSeconds: 660, endedAt: status === 'Signed out' ? now : null },
});
(async () => {
  fs.writeFileSync(path.join(output, 'entry.tsx'), `import React from 'react';import{createRoot}from'react-dom/client';import ActivityTracker from ${JSON.stringify(root + '/components/ActivityTracker')};import UserActivity from ${JSON.stringify(root + '/app/admin/activity/UserActivity')};import ${JSON.stringify(root + '/app/globals.css')};createRoot(document.getElementById('root')!).render(<><ActivityTracker userId="user"/><h1>User Activity</h1><UserActivity/></>);`);
  await esbuild.build({ entryPoints: [path.join(output, 'entry.tsx')], bundle: true, outfile: path.join(output, 'app.js'), nodePaths: [root + '/node_modules'], jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'alias', setup(build) { build.onResolve({ filter: /^@\// }, args => ({ path: path.join(root, args.path.slice(2) + '.ts') })); } }] });
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/api/auth/session') return res.end(JSON.stringify({ user: { id: 'user' }, activity: { id: sid } }));
    if (url.pathname === '/api/activity/check-in') {
      let body = ''; req.on('data', value => body += value); req.on('end', () => { checks.push(JSON.parse(body)); res.statusCode = rejectCheck ? 401 : 204; res.end(); }); return;
    }
    if (url.pathname === '/api/admin/activity') {
      queries.push(url.searchParams.get('q'));
      if (url.searchParams.get('q') === 'fail') { res.statusCode = 500; return res.end(JSON.stringify({ error: 'Could not load user activity. Try again.' })); }
      const rows = url.searchParams.get('q') === 'Alex' ? [row(0, 'Online')] : ['Online', 'Idle', 'Offline', 'Signed out'].map((status, index) => row(index, status));
      return res.end(JSON.stringify({ rows, hasMore: false, updatedAt: now }));
    }
    if (['/app.js', '/app.css'].includes(url.pathname)) { res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css'); return res.end(fs.readFileSync(path.join(output, url.pathname.slice(1)))); }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="public-page"><main id="root"></main><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch(launch());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(now) });
  await page.addInitScript(() => {
    Object.defineProperty(document, 'hasFocus', { value: () => window.__focused !== false });
    Object.defineProperty(document, 'visibilityState', { get: () => window.__visibility || 'visible' });
  });
  const ping = () => page.waitForResponse(response => response.url().endsWith('/api/activity/check-in'));
  let request = ping();
  await page.goto('http://127.0.0.1:' + server.address().port); await request;
  await page.getByRole('cell', { name: 'Alex Client', exact: false }).waitFor();
  assert.equal(checks[0].visible, true); assert.equal(checks[0].sessionId, sid);
  assert.equal(checks[0].idleSeconds, 0);
  await page.getByText('Tracking started; sign-in time unknown', { exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 4);
  await page.screenshot({ path: path.join(output, 'activity-desktop.png'), fullPage: true });
  request = ping(); await page.clock.fastForward(300000); await request;
  assert.ok(checks.at(-1).idleSeconds >= 300, 'an untouched tab must become idle');
  request = ping();
  await page.evaluate(() => { window.__visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
  await request; assert.equal(checks.at(-1).visible, false);
  const hiddenCount = checks.length;
  await page.clock.fastForward(120000);
  assert.equal(checks.length, hiddenCount, 'hidden tabs must stop periodic check-ins');
  await page.keyboard.press('Shift');
  request = ping(); await page.evaluate(() => { window.__visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); }); await request;
  assert.equal(checks.at(-1).visible, true); assert.ok(checks.at(-1).idleSeconds < 2);
  await page.getByLabel('Find a person or business').fill('Alex');
  await Promise.all([page.waitForResponse(response => response.url().includes('q=Alex')),
    page.getByRole('button', { name: 'Search', exact: true }).click()]);
  await page.getByRole('cell', { name: 'Alex Client', exact: false }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'the phone page must fit; only the table scrolls sideways');
  await page.screenshot({ path: path.join(output, 'activity-mobile.png'), fullPage: true });
  await page.getByLabel('Find a person or business').fill('fail');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').textContent(), /Could not load user activity/);
  rejectCheck = true;
  request = ping(); await page.clock.fastForward(30000); await request;
  const stoppedCount = checks.length; await page.clock.fastForward(90000);
  assert.equal(checks.length, stoppedCount, 'a rejected or changed sign-in must stop reporting');
  assert.deepEqual(errors, []);
  console.log('PASS: stable session check-ins, idle/hidden tabs, activity recovery, 401 stop, admin status labels, unknown legacy sign-ins, search, visible errors, and mobile layout. Screenshots: ' + output);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server?.close(); });
