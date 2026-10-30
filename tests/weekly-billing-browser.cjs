const { chromium } = require('playwright'), esbuild = require('esbuild'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = process.env.WEEKLY_BILLING_QA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'weekly-billing-'));
let server, browser;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import Page from ${JSON.stringify(root + '/app/billing/page')};import ${JSON.stringify(root + '/app/globals.css')};Page().then(view=>createRoot(document.getElementById('root')).render(view));`);
  const mocks = {
    '@/lib/auth/context': `export async function tenantContext(){return {organizationId:'org',role:'owner',isSuperAdmin:false}}`,
    '@/lib/prisma': `export const prisma={subscription:{findUnique:async()=>({plan:'starter',status:'trialing',credits:100})}}`,
    'next/link': `import React from 'react';export default function Link(props){return <a {...props}/>}`,
  };
  await esbuild.build({ entryPoints: [path.join(out, 'entry.tsx')], bundle: true, outfile: path.join(out, 'app.js'), nodePaths: [root + '/node_modules'], jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'process.env.STRIPE_SECRET_KEY': '"test-browser-only"', 'process.env': JSON.stringify({ STRIPE_STARTER_PRICE_ID: 'price-intro', STRIPE_CREATOR_PRICE_ID: 'price-growth', STRIPE_BUSINESS_PRICE_ID: 'price-business', STRIPE_AGENCY_PRICE_ID: 'price-agency' }) }, plugins: [{ name: 'fixtures', setup(b) {
    b.onResolve({ filter: /.*/ }, a => {
      if (mocks[a.path]) return { path: a.path, namespace: 'fixture' };
      if (a.path.startsWith('@/')) { const base = path.join(root, a.path.slice(2)); return { path: ['.ts', '.tsx'].map(ext => base + ext).find(fs.existsSync) }; }
    });
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: mocks[a.path], loader: 'tsx', resolveDir: root }));
  } }] });
  const requests = [];
  server = http.createServer((req, res) => {
    if (req.url === '/api/billing/checkout') { let body = ''; req.on('data', x => body += x); req.on('end', () => { requests.push(JSON.parse(body)); res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Checkout is unavailable in this preview.' })); }); return; }
    if (['/app.js', '/app.css'].includes(req.url)) { res.setHeader('Content-Type', req.url.endsWith('css') ? 'text/css' : 'text/javascript'); res.end(fs.readFileSync(path.join(out, req.url.slice(1)))); return; }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body class="public-page"><main id="root" style="margin:0;max-width:1440px;padding:24px"></main><script src="/app.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch(require('./browser-launch.cjs')()); const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); await page.goto('http://127.0.0.1:' + server.address().port);
  await page.getByRole('heading', { name: 'Plans & Rumi credits' }).waitFor();
  for (const name of ['Trial', 'Intro', 'Growth', 'Business', 'Agency']) assert.equal(await page.getByRole('heading', { name, exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Choose Intro', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: 'Choose Growth', exact: true }).click(); await page.getByRole('alert').waitFor(); assert.deepEqual(requests, [{ plan: 'creator' }]);
  await page.screenshot({ path: path.join(out, 'plans-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.screenshot({ path: path.join(out, 'plans-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []); console.log('PASS: all five packages, current trial balance, explicit plan choice, checkout failure and mobile layout.'); console.log(out);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve) || resolve()); });
