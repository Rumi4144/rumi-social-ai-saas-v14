const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const assert = require('node:assert/strict'), esbuild = require('esbuild'), { chromium } = require('playwright'), sharp = require('sharp');
const repo = process.cwd(), out = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-picture-browser-'));
const qa = process.env.PICTURE_QA_DIR || path.join(os.tmpdir(), 'rumi-picture-qa'); fs.mkdirSync(qa, { recursive: true });
let browser, server;
const item = { id: 'post', campaignId: 'campaign', brandId: 'brand', date: '2026-11-02', plannedDate: '2026-11-06', canChangeDate: true, day: 1, type: 'post', kind: 'image', headline: 'Find your sound', caption: 'Our original caption.', status: 'approved', isReady: true, approvalBlockedReason: null, previewUrl: '/api/media/original', mediaUrl: '/api/media/original', mediaKind: 'image', assetId: 'original', downloadUrl: '/download', platforms: ['facebook'], needsAttention: false, deliveries: [], changeRequest: null, changesRequested: false, nextAction: 'review' };
const requests = [], errors = []; let saved = { ...item }, rejectSave = false;
(async () => {
 const { load } = require('./helpers/weekly-load.cjs');
 const { renderSocialSvg } = load('lib/render/svg.ts'), { svgToPublishJpeg, weeklyDesignFonts } = load('lib/render/raster.ts');
 const photo = fs.readFileSync(path.join(repo, 'public/design-formats/rumi-guitar.png'));
 const ad = await svgToPublishJpeg(renderSocialSvg({ headline: 'Find your sound', cta: 'Explore the MF-17', brand: 'Rumi Guitars', format: 'portrait', designStyle: 'weekly-orbit', imageUrl: 'data:image/png;base64,' + photo.toString('base64'), logoUrl: 'data:image/png;base64,' + fs.readFileSync(path.join(repo, 'public/design-formats/rumi-guitars-logo.png')).toString('base64'), primaryColor: '#14283c', accentColor: '#dbbb74', designFonts: await weeklyDesignFonts() }));
 fs.writeFileSync(path.join(out, 'entry.tsx'), `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Card from ${JSON.stringify(repo + '/components/weekly/WeeklyCard')};import styles from ${JSON.stringify(repo + '/components/weekly/weekly.module.css')};import ${JSON.stringify(repo + '/app/globals.css')};
 const initial=${JSON.stringify(item)};function App(){const [item,setItem]=useState(initial);window.updateItem=patch=>setItem(value=>({...value,...patch}));return <main className={styles.workspace} style={{padding:24}}><h1>This Week</h1><div className={styles.grid}><Card item={item} isAdmin={location.pathname.includes('admin')} canManage={!location.pathname.includes('viewer')} onChanged={()=>fetch('/fixture').then(r=>r.json()).then(setItem)}/>{['scheduled','published','reel'].map(status=><Card key={status} item={{...initial,id:status,status:status==='reel'?'draft':status,kind:status==='reel'?'motion_reel':'image'}} canManage onChanged={()=>{}}/>)}</div></main>}createRoot(document.getElementById('root')).render(<App/>);`);
 await esbuild.build({ entryPoints: [path.join(out, 'entry.tsx')], bundle: true, outfile: path.join(out, 'app.js'), nodePaths: [repo + '/node_modules'], jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
 server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  const json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
  if (url.pathname === '/fixture') return json(saved);
  if (['/app.js', '/app.css'].includes(url.pathname)) { res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript'); return res.end(fs.readFileSync(path.join(out, url.pathname.slice(1)))); }
  if (url.pathname.startsWith('/api/media/')) { res.setHeader('Content-Type', 'image/jpeg'); return res.end(ad); }
  if (url.pathname === '/photo.png') { res.setHeader('Content-Type', 'image/png'); return res.end(photo); }
  if (url.pathname.endsWith('/picture')) {
   if (req.method === 'GET') return json({ photos: [{ id: 'saved-photo', src: '/photo.png', label: 'Martinez MF-17' }] });
   const chunks = []; for await (const chunk of req) chunks.push(chunk); const bytes = Buffer.concat(chunks);
   let body;
   if (req.headers['content-type'].includes('multipart')) { const form = await new Response(bytes, { headers: req.headers }).formData(); body = { expectedMediaUrl: form.get('expectedMediaUrl'), fileName: form.get('photo').name }; }
   else body = JSON.parse(bytes.toString());
   requests.push(body);
   if (rejectSave) { res.statusCode = 409; return json({ error: 'This ad changed. Refresh before trying again.' }); }
   saved = { ...saved, status: 'draft', mediaUrl: '/api/media/replaced-' + requests.length, previewUrl: '/api/media/replaced-' + requests.length, assetId: 'replaced-' + requests.length };
   return json({ mediaUrl: saved.mediaUrl, status: saved.status });
  }
  if (url.pathname.startsWith('/api/')) { res.statusCode = 500; return json({ error: 'Unexpected API' }); }
  res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="public-page"><div id="root"></div><script src="/app.js"></script></body></html>');
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 browser = await chromium.launch(require('./browser-launch.cjs')()); const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
 page.on('pageerror', error => errors.push(error.message)); const base = 'http://127.0.0.1:' + server.address().port;
 await page.goto(base); const card = page.getByTestId('weekly-post-post');
 await card.getByRole('button', { name: 'Replace picture', exact: true }).waitFor();
 for (const id of ['scheduled', 'published', 'reel']) assert.equal(await page.getByTestId('weekly-post-' + id).getByRole('button', { name: 'Replace picture' }).count(), 0);
 await card.getByRole('button', { name: 'Replace picture', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Replace picture', exact: true });
 await dialog.getByRole('button', { name: 'Martinez MF-17' }).waitFor();
 assert.ok(await dialog.getByRole('button', { name: 'Use this picture' }).isDisabled());
 await page.keyboard.press('Escape'); assert.equal(await dialog.isVisible(), false); assert.equal(requests.length, 0);
 assert.ok(await card.getByRole('button', { name: 'Replace picture' }).evaluate(el => el === document.activeElement));
 await card.getByRole('button', { name: 'Replace picture' }).click();
 await dialog.getByRole('button', { name: 'Martinez MF-17' }).click();
 await dialog.getByAltText('Selected replacement picture').waitFor();
 assert.equal(await dialog.getByRole('button', { name: 'Martinez MF-17' }).getAttribute('aria-pressed'), 'true');
 await page.screenshot({ path: path.join(qa, 'replace-picture-desktop.png'), fullPage: true });
 rejectSave = true; await dialog.getByRole('button', { name: 'Use this picture' }).click();
 await dialog.getByRole('alert').waitFor(); assert.equal(saved.status, 'approved'); assert.equal(saved.mediaUrl, '/api/media/original');
 assert.equal(await card.locator('img').first().getAttribute('src'), '/api/media/original');
 rejectSave = false; await dialog.getByRole('button', { name: 'Use this picture' }).click();
 await card.getByText('Picture replaced. Review the updated ad, then approve it again.', { exact: true }).waitFor();
 await card.getByRole('button', { name: 'Approve post', exact: true }).waitFor();
 assert.equal(await dialog.isVisible(), false); assert.equal(saved.caption, item.caption); assert.equal(saved.plannedDate, '2026-11-06');
 assert.equal(requests[1].assetId, 'saved-photo'); assert.equal(requests[1].expectedMediaUrl, '/api/media/original');
 assert.equal(await card.locator('img').first().getAttribute('src'), saved.mediaUrl);
 // Upload validation and selection switching work on a small screen too.
 await page.setViewportSize({ width: 390, height: 844 });
 await card.getByRole('button', { name: 'Replace picture' }).click();
 await dialog.getByLabel('Upload a picture', { exact: true }).setInputFiles({ name: 'not-photo.txt', mimeType: 'text/plain', buffer: Buffer.from('text') });
 await dialog.getByText('Choose a JPEG, PNG or WebP picture up to 3 MB.', { exact: true }).waitFor();
 assert.ok(await dialog.getByRole('button', { name: 'Use this picture' }).isDisabled());
 await dialog.getByLabel('Upload a picture', { exact: true }).setInputFiles({ name: 'my-guitar.png', mimeType: 'image/png', buffer: photo });
 await dialog.getByAltText('Selected replacement picture').waitFor();
 await dialog.getByRole('button', { name: 'Martinez MF-17' }).click(); assert.equal(await dialog.getByLabel('Upload a picture').inputValue(), '');
 await dialog.getByLabel('Upload a picture').setInputFiles({ name: 'my-guitar.png', mimeType: 'image/png', buffer: photo });
 assert.equal(await dialog.getByRole('button', { name: 'Martinez MF-17' }).getAttribute('aria-pressed'), 'false');
 assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
 await page.screenshot({ path: path.join(qa, 'replace-picture-mobile.png'), fullPage: true });
 await dialog.getByRole('button', { name: 'Use this picture' }).click(); await dialog.waitFor({ state: 'hidden' });
 assert.equal(requests.at(-1).fileName, 'my-guitar.png'); assert.equal(requests.at(-1).expectedMediaUrl, '/api/media/replaced-2');
 // Refreshing the parent while the chooser is open cannot silently accept a newer artwork version.
 await card.getByRole('button', { name: 'Replace picture' }).click(); await dialog.getByRole('button', { name: 'Martinez MF-17' }).click();
 const before = saved.mediaUrl; await page.evaluate(() => window.updateItem({ mediaUrl: '/api/media/unseen-update' }));
 rejectSave = true; await dialog.getByRole('button', { name: 'Use this picture' }).click(); await dialog.getByRole('alert').waitFor();
 assert.equal(requests.at(-1).expectedMediaUrl, before); await dialog.getByRole('button', { name: 'Close picture chooser' }).click();
 await page.goto(base + '/viewer'); assert.equal(await page.getByTestId('weekly-post-post').getByRole('button', { name: 'Replace picture' }).count(), 0);
 await page.goto(base + '/admin'); await page.evaluate(() => window.updateItem({status:'draft',isReady:false,changeRequest:{comment:'Change photo',createdAt:new Date().toISOString()}})); await page.getByTestId('weekly-post-post').getByRole('button',{name:'Replace picture'}).waitFor();
 await page.goto(base); await page.evaluate(() => window.updateItem({status:'draft',isReady:false,changeRequest:{comment:'Change photo',createdAt:new Date().toISOString()}})); assert.equal(await page.getByTestId('weekly-post-post').getByRole('button',{name:'Replace picture'}).count(),0);
 assert.deepEqual(errors, []); console.log('Picture chooser passed: saved photos, upload, failure recovery, stale versions, approval reset, delivery locks, focus, mobile and viewer access. Screenshots: ' + qa);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });
