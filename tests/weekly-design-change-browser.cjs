const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const assert = require('node:assert/strict'), esbuild = require('esbuild'), { chromium } = require('playwright'), sharp = require('sharp');
const { load } = require('./helpers/weekly-load.cjs');
const repo = process.cwd(), out = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-design-browser-'));
const qa = process.env.DESIGN_CHANGE_QA_DIR || path.join(os.tmpdir(), 'rumi-design-change-qa'); fs.mkdirSync(qa, { recursive: true });
let browser, server;
const item = { id: 'post', campaignId: 'campaign', brandId: 'brand', date: '2026-11-02', plannedDate: '2026-11-06', canChangeDate: true, day: 1, type: 'post', kind: 'image', headline: 'Find your sound', caption: 'Our original caption.', status: 'approved', isReady: true, approvalBlockedReason: null, previewUrl: '/api/media/original', mediaUrl: '/api/media/original', mediaKind: 'image', assetId: 'original', downloadUrl: '/download', platforms: ['facebook'], needsAttention: false, deliveries: [], changeRequest: null, changesRequested: false, nextAction: 'review' };
const requests = [], errors = []; let saved = { ...item }, currentDesign = 'weekly-orbit', rejectSave = false, rejectLoad = false;
(async () => {
  const { renderSocialSvg } = load('lib/render/svg.ts'), { svgToPublishJpeg, weeklyDesignFonts } = load('lib/render/raster.ts');
  const { WEEKLY_DESIGN_CHOICES: choices, WEEKLY_DESIGN_FAMILIES: families } = load('lib/render/weekly-layouts.ts');
  const dataImage = file => 'data:image/png;base64,' + fs.readFileSync(path.join(repo, 'public/design-formats', file)).toString('base64');
  const recipe = { headline: item.headline, cta: 'Explore the MF-17', brand: 'Rumi Guitars', format: 'portrait', imageUrl: dataImage('rumi-guitar.png'), logoUrl: dataImage('rumi-guitars-logo.png'), primaryColor: '#14283c', accentColor: '#dbbb74', designFonts: await weeklyDesignFonts() };
  const renders = new Map(), assets = new Map();
  async function render(layout) { if (!renders.has(layout)) renders.set(layout, await svgToPublishJpeg(renderSocialSvg({ ...recipe, designStyle: layout }))); return renders.get(layout); }
  assets.set(item.mediaUrl, await render(currentDesign));
  fs.writeFileSync(path.join(out, 'entry.tsx'), `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Card from ${JSON.stringify(repo + '/components/weekly/WeeklyCard')};import styles from ${JSON.stringify(repo + '/components/weekly/weekly.module.css')};import ${JSON.stringify(repo + '/app/globals.css')};
  const initial=${JSON.stringify(item)};function App(){const [item,setItem]=useState(initial);window.updateItem=patch=>setItem(value=>({...value,...patch}));return <main className={styles.workspace} style={{padding:24}}><h1>This Week</h1><div className={styles.grid}><Card item={item} canManage={!location.pathname.includes('viewer')} onChanged={()=>fetch('/fixture').then(r=>r.json()).then(setItem)}/>{['scheduled','published','reel','delivery'].map(status=><Card key={status} item={{...initial,id:status,status:['reel','delivery'].includes(status)?'draft':status,kind:status==='reel'?'motion_reel':'image',deliveries:status==='delivery'?[{id:'d',status:'verification_pending',platform:'facebook'}]:[]}} canManage onChanged={()=>{}}/>)}</div></main>}createRoot(document.getElementById('root')).render(<App/>);`);
  await esbuild.build({ entryPoints: [path.join(out, 'entry.tsx')], bundle: true, outfile: path.join(out, 'app.js'), nodePaths: [repo + '/node_modules'], jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local'), json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
    try {
      if (url.pathname === '/fixture') return json(saved);
      if (['/app.js', '/app.css'].includes(url.pathname)) { res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript'); return res.end(fs.readFileSync(path.join(out, url.pathname.slice(1)))); }
      if (url.pathname.startsWith('/api/media/')) { res.setHeader('Content-Type', 'image/jpeg'); return res.end(assets.get(url.pathname) || assets.get(item.mediaUrl)); }
      if (url.pathname.endsWith('/design')) {
        if (req.method === 'GET') {
          if (rejectLoad) { res.statusCode = 503; return json({ error: 'Could not prepare previews. Try again.' }); }
          const family = url.searchParams.get('family'), layout = url.searchParams.get('layout'), page = Number(url.searchParams.get('page') || 0);
          const filtered = choices.filter(choice => !family || choice.family === family), rows = layout ? choices.filter(choice => choice.value === layout) : filtered.slice(page * 6, page * 6 + 6);
          const previews = [];
          for (const row of rows) { const full = await render(row.value), bytes = layout ? full : await sharp(full).resize({ width: 360 }).jpeg({ quality: 82 }).toBuffer(); previews.push({ id: row.value, label: row.label, family: row.family, src: 'data:image/jpeg;base64,' + bytes.toString('base64') }); }
          return json({ choices: previews, currentDesign, page, pageCount: Math.ceil(filtered.length / 6), total: filtered.length, families });
        }
        const chunks = []; for await (const chunk of req) chunks.push(chunk); const body = JSON.parse(Buffer.concat(chunks)); requests.push(body);
        if (rejectSave) { res.statusCode = 409; return json({ error: 'This ad changed. Close the chooser and refresh before trying again.' }); }
        currentDesign = body.layout; const mediaUrl = '/api/media/changed-' + requests.length; assets.set(mediaUrl, await render(currentDesign)); saved = { ...saved, status: 'draft', mediaUrl, previewUrl: mediaUrl, assetId: 'changed-' + requests.length };
        return json({ mediaUrl, status: 'draft' });
      }
      if (url.pathname.startsWith('/api/')) { res.statusCode = 500; return json({ error: 'Unexpected API' }); }
      res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="public-page"><div id="root"></div><script src="/app.js"></script></body></html>');
    } catch (error) { res.statusCode = 500; json({ error: error.message }); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch(require('./browser-launch.cjs')()); const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', error => errors.push(error.message)); const base = 'http://127.0.0.1:' + server.address().port;
  await page.goto(base); const card = page.getByTestId('weekly-post-post'), open = card.getByRole('button', { name: 'Change design', exact: true });
  await open.waitFor(); await card.getByRole('button', { name: 'Replace picture', exact: true }).waitFor();
  for (const id of ['scheduled', 'published', 'reel', 'delivery']) assert.equal(await page.getByTestId('weekly-post-' + id).getByRole('button', { name: 'Change design' }).count(), 0);
  await open.click(); const dialog = page.getByRole('dialog', { name: 'Change design', exact: true }), use = dialog.getByRole('button', { name: 'Use this design' });
  await dialog.getByRole('button', { name: /Color Banner preview/ }).waitFor(); assert.equal(await dialog.locator('button[aria-pressed]').count(), 6); assert.ok(await use.isDisabled());
  await dialog.getByRole('button', { name: /Color Orbit preview/ }).click(); assert.ok(await use.isDisabled());
  await page.keyboard.press('Escape'); assert.equal(await dialog.isVisible(), false); assert.equal(requests.length, 0); assert.ok(await open.evaluate(el => el === document.activeElement));
  await open.click(); await dialog.getByRole('button', { name: /Color Banner preview/ }).click();
  await page.screenshot({ path: path.join(qa, 'design-chooser-desktop.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Enlarge selected design' }).click(); await dialog.getByAltText('Color Banner full-size preview').waitFor();
  assert.equal(await dialog.getByAltText('Color Banner full-size preview').evaluate(el => el.naturalWidth), 1080);
  await dialog.getByRole('button', { name: 'Close large preview' }).click();
  await dialog.getByRole('button', { name: 'More designs' }).click(); await dialog.getByText('Page 2 of 15', { exact: true }).waitFor(); assert.ok(await use.isDisabled());
  await dialog.getByLabel('Design family').selectOption('Circular'); await dialog.getByRole('button', { name: /Color Orbit preview/ }).waitFor();
  await dialog.getByLabel('Design family').selectOption(''); await dialog.getByRole('button', { name: /Color Banner preview/ }).waitFor();
  // Failed loading must not leave previews from the previous page selectable.
  rejectLoad = true; await dialog.getByRole('button', { name: 'More designs' }).click(); await dialog.getByRole('alert').waitFor(); assert.equal(await dialog.locator('button[aria-pressed]').count(), 0); assert.ok(await use.isDisabled());
  rejectLoad = false; await dialog.getByRole('button', { name: 'Reload designs' }).click(); await dialog.getByText('Page 2 of 15', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Previous designs' }).click(); await dialog.getByRole('button', { name: /Color Banner preview/ }).click();
  rejectSave = true; await use.click(); await dialog.getByRole('alert').waitFor(); assert.equal(saved.status, 'approved'); assert.equal(await card.locator('img').first().getAttribute('src'), item.mediaUrl);
  rejectSave = false; await use.click(); await card.getByText('Design changed. Review the updated ad, then approve it again.', { exact: true }).waitFor();
  await card.getByRole('button', { name: 'Approve post', exact: true }).waitFor(); assert.equal(await dialog.isVisible(), false); assert.equal(saved.caption, item.caption); assert.equal(saved.plannedDate, item.plannedDate);
  assert.deepEqual(requests[1], { expectedMediaUrl: item.mediaUrl, layout: 'weekly-banner' }); assert.equal(await card.locator('img').first().getAttribute('src'), saved.mediaUrl);
  await page.setViewportSize({ width: 390, height: 844 }); await open.click(); await dialog.getByRole('button', { name: /Color Orbit preview/ }).click();
  assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  const action = await use.boundingBox(); assert.ok(action.y >= 0 && action.y + action.height <= 844, 'Save action stays visible without scrolling');
  await page.screenshot({ path: path.join(qa, 'design-chooser-mobile.png'), fullPage: true });
  // A refresh behind an open chooser must still submit the artwork version reviewed.
  const before = saved.mediaUrl; await page.evaluate(() => window.updateItem({ mediaUrl: '/api/media/unseen-update' }));
  rejectSave = true; await use.click(); await dialog.getByRole('alert').waitFor(); assert.equal(requests.at(-1).expectedMediaUrl, before);
  await dialog.getByRole('button', { name: 'Close design chooser' }).click();
  await page.goto(base + '/viewer'); assert.equal(await page.getByTestId('weekly-post-post').getByRole('button', { name: 'Change design' }).count(), 0);
  assert.deepEqual(errors, []); console.log('Design chooser passed: real previews, pagination, families, enlarge, save, cancellation, failures, stale snapshots, approval reset, protected ads, focus and mobile. Screenshots: ' + qa);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });
