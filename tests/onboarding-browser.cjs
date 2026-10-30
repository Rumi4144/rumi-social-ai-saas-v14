const { chromium } = require('playwright'), esbuild = require('esbuild'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = process.env.ONBOARDING_QA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-'));
let server, browser, scenario = 'new';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import Page from ${JSON.stringify(root + '/app/onboarding/page')};import ${JSON.stringify(root + '/app/globals.css')};createRoot(document.getElementById('root')).render(<Page/>);`);
  await esbuild.build({ entryPoints: [path.join(out, 'entry.tsx')], bundle: true, outfile: path.join(out, 'app.js'), nodePaths: [root + '/node_modules'], jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'fixtures', setup(b) {
    b.onResolve({ filter: /.*/ }, a => {
      if (a.path === 'next/navigation') return { path: a.path, namespace: 'fixture' };
      if (a.path.startsWith('@/')) { const base = path.join(root, a.path.slice(2)); return { path: ['.ts', '.tsx'].map(ext => base + ext).find(fs.existsSync) }; }
    });
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export function useRouter(){return {push:path=>window.__navigation=path,replace:path=>window.__navigation=path,refresh:()=>{}}}`, loader: 'js' }));
  } }] });
  const requests = [], errors = [];
  const logo = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="70"><rect width="220" height="70" rx="6" fill="#163d35"/><text x="110" y="32" text-anchor="middle" font-family="serif" font-size="21" fill="#efcb78">GUITAR HOUSE</text><text x="110" y="51" text-anchor="middle" font-family="sans-serif" font-size="10" fill="white">ORIGINAL WEBSITE LOGO</text></svg>').toString('base64');
  function json(res, body, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }
  server = http.createServer((req, res) => {
    if (req.url === '/api/onboarding/profile') { json(res, { canManage: scenario !== 'viewer', brand: scenario === 'complete' ? { name: 'Guitar House', websiteUrl: 'https://guitar.test/', onboardingCompleted: true } : null }); return; }
    if (['/api/onboarding/website', '/api/onboarding/complete'].includes(req.url)) {
      let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => {
        const data = JSON.parse(body); requests.push({ path: req.url, body: data });
        if (req.url.endsWith('/website')) {
          if (scenario === 'failure') { json(res, { error: 'This website could not be read. You can add your business details yourself.' }, 422); return; }
          json(res, { reviewId: 'review-a', website: 'https://guitar.test/', logoUrl: logo, products: [{ name: 'Concert guitar', sourceUrl: 'https://guitar.test/product/concert', photoCount: 3 }], suggestions: { description: 'Handmade guitars for musicians who value a clear, warm sound.', industry: 'Music & Instruments', targetAudience: 'Guitar players and teachers' }, warnings: [] }); return;
        }
        json(res, { brandId: 'brand-a', completed: true });
      }); return;
    }
    if (['/app.js', '/app.css'].includes(req.url)) { res.setHeader('Content-Type', req.url.endsWith('css') ? 'text/css' : 'text/javascript'); res.end(fs.readFileSync(path.join(out, req.url.slice(1)))); return; }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body class="public-page"><main id="root" style="margin:0 auto;max-width:1200px;padding:20px"></main><script src="/app.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch(require('./browser-launch.cjs')());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }); page.on('pageerror', error => errors.push(error.message));
  const url = 'http://127.0.0.1:' + server.address().port;
  await page.goto(url); await page.getByLabel('Business name', { exact: true }).waitFor();
  await page.getByLabel('Business name', { exact: true }).fill('Guitar House');
  await page.getByLabel('Business website', { exact: false }).fill('guitar.test');
  await page.getByRole('button', { name: 'Read my website' }).click();
  await page.getByRole('heading', { name: 'Your website assets' }).waitFor();
  assert.equal(await page.getByRole('img', { name: 'Guitar House logo found on the website' }).count(), 1);
  assert.equal(await page.getByText('1 product found · 3 original product photos.', { exact: true }).count(), 1);
  assert.match(await page.getByLabel('What do you offer?', { exact: false }).inputValue(), /Handmade guitars/);
  assert.equal(await page.locator('select').count(), 1, 'No access-role, model or template selector');
  await page.screenshot({ path: path.join(out, 'onboarding-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.screenshot({ path: path.join(out, 'onboarding-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Continue to my first week' }).click();
  await page.waitForFunction(() => window.__navigation === '/dashboard');
  assert.deepEqual(requests[0], { path: '/api/onboarding/website', body: { brand: 'Guitar House', website: 'guitar.test' } });
  assert.equal(requests[1].body.websiteReviewId, 'review-a'); assert.equal(requests[1].body.website, 'https://guitar.test/');
  for (const key of ['role', 'designStyle', 'headingFont', 'approvalRequired']) assert.equal(key in requests[1].body, false);
  scenario = 'failure'; await page.goto(url);
  await page.getByLabel('Business name', { exact: true }).fill('Local teacher');
  await page.getByLabel('Business website', { exact: false }).fill('unreadable.test');
  await page.getByRole('button', { name: 'Read my website' }).click();
  await page.getByText('This website could not be read. You can add your business details yourself.', { exact: true }).waitFor();
  await page.getByLabel('Business website', { exact: false }).fill('');
  await page.getByLabel('What do you offer?', { exact: false }).fill('Private guitar lessons for beginners and returning players.');
  await page.getByRole('button', { name: 'Continue to my first week' }).click(); await page.waitForFunction(() => window.__navigation === '/dashboard');
  assert.equal('websiteReviewId' in requests.at(-1).body, false); assert.equal(requests.at(-1).body.website, '');
  scenario = 'viewer'; const before = requests.length; await page.goto(url);
  await page.getByText('Your workspace owner or administrator can finish setup.', { exact: false }).waitFor();
  assert.equal(await page.getByLabel('Business name', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Continue to my first week' }).isDisabled(), true); assert.equal(requests.length, before);
  scenario = 'complete'; await page.goto(url); await page.waitForFunction(() => window.__navigation === '/dashboard'); assert.equal(requests.length, before);
  assert.deepEqual(errors, []);
  console.log('PASS: website-first setup, actual logo/product review, scoped review save, manual failure recovery, completed-account redirect, viewer lock and mobile layout.'); console.log(out);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve) || resolve()); });
