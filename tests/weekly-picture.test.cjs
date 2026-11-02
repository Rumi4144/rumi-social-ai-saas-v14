const { test } = require('node:test'), assert = require('node:assert/strict'), sharp = require('sharp');
const { load } = require('./helpers/weekly-load.cjs');
const ctx = { organizationId: 'org', userId: 'customer' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABQAAAAeCAIAAACjcKk8AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAKElEQVQ4jWPYuqSBbMQwqrlhNMAaRhNJw2jGaBgtDJaMFgZLhmdhAADG21TVuSmZnwAAAABJRU5ErkJggg==', 'base64');
const picture = 'data:image/png;base64,' + png.toString('base64');
const clean = value => JSON.parse(JSON.stringify(value));
function fixture(options = {}) {
  const writes = [], renders = [];
  const item = { id: 'post', type: 'post', campaignId: 'campaign', headline: 'Original headline', caption: 'Original caption', status: 'approved', mediaUrl: '/api/media/original', scheduledFor: new Date('2026-11-05T12:00:00Z'), campaign: { brandId: 'brand', brand: { id: 'brand', name: 'Brand', designStyle: 'classic' } }, ...options.item };
  const recipe = { headline: 'Custom artwork headline', subheadline: 'Supporting line', cta: 'Learn more', brand: 'Real brand', logoUrl: 'data:image/png;base64,logo', designStyle: 'weekly-orbit', format: 'portrait', accentColor: '#eeaa00', imageUrls: ['saved-supporting-photo'] };
  const creative = { id: 'original', metadata: { format: 'portrait', designStyle: 'weekly-orbit', ...(!options.legacy && { pictureRecipe: recipe }) }, url: 'original-creative' };
  let reads = 0, ids = 0;
  const db = {
    contentItem: {
      findFirst: async q => { assert.equal(q.where.campaign.brand.organizationId, 'org'); reads++; if (options.missing) return null; return reads > 1 && options.race ? { ...item, [options.race]: 'changed' } : item; },
      update: async q => { writes.push(['item', q.data]); Object.assign(item, q.data); },
    },
    campaign: { findMany: async q => { assert.equal(q.where.brandId, 'brand'); assert.equal(q.where.brand.organizationId, 'org'); return [{ id: 'campaign' }, { id: 'same-brand' }]; } },
    publishJob: { findFirst: async q => { assert.equal(q.where.organizationId, 'org'); assert.equal(q.where.contentItemId, 'post'); assert.ok(q.where.status.in.includes('verification_pending')); return options.delivery || (reads > 1 && options.raceDelivery) ? { id: 'delivery' } : null; } },
    job: { findFirst: async q => { assert.equal(q.where.organizationId, 'org'); return options.pendingChange ? { id: 'change' } : null; } },
    mediaAsset: {
      findFirst: async q => { assert.equal(q.where.organizationId, 'org'); if (q.where.id === 'original') { assert.equal(q.where.contentItemId, 'post'); assert.equal(q.where.campaignId, 'campaign'); return options.noCreative ? null : creative; }
        assert.equal(q.where.id, 'photo'); assert.deepEqual(clean(q.where.OR), [{ campaignId: { in: ['campaign', 'same-brand'] } }, { campaignId: null, metadata: { path: ['brandId'], equals: 'brand' } }]);
        return options.foreignSource ? null : { id: 'photo', kind: 'product_photo', url: options.badPhoto ? 'data:image/svg+xml;base64,abc' : picture, metadata: { productName: 'Martinez', sourceUrl: 'https://products.test/martinez' } };
      },
      findMany: async q => { assert.equal(q.where.organizationId, 'org'); assert.equal(q.where.OR[1].metadata.equals, 'brand'); return [{ id: 'photo', url: picture, kind: 'product_photo', metadata: { productName: 'Martinez' } }, { id: 'duplicate', url: picture, kind: 'product_photo', metadata: {} }, { id: 'upload', url: 'different', kind: 'product_photo', metadata: { label: 'Uploaded photo' } }]; },
      create: async q => { writes.push(['asset', q.data]); return { ...q.data, id: `new-${++ids}` }; },
    },
    auditLog: { create: async q => writes.push(['audit', q.data]) },
  };
  db.$transaction = async (fn, config) => { assert.equal(config.isolationLevel, 'Serializable'); return fn(db); };
  const api = load('lib/creative/replace-picture.ts', {
    '@/lib/prisma': { prisma: db },
    '@/lib/render/svg': { renderSocialSvg: input => { renders.push(clean(input)); return 'svg'; } },
    '@/lib/render/raster': { logoToPngDataUrl: async () => 'saved-logo', weeklyDesignFonts: async () => ({ display: 'fonts' }), svgToPublishJpeg: async () => { if (options.renderFailure) throw Error('Export failed'); return Buffer.from('finished-jpeg'); } },
    '@/lib/reels/public-fetch': { fetchPublicBytes: async () => { throw Error('Unexpected network'); } },
  });
  return { ...api, item, recipe, writes, renders, replace: (input = {}) => api.replacePicture(ctx, 'post', { expectedMediaUrl: '/api/media/original', assetId: 'photo', ...input }) };
}
test('replacement keeps design, logo, wording and date, saves complete artwork, resets approval and preserves old assets', async () => {
  const f = fixture(), before = clean(f.item);
  const result = await f.replace();
  assert.equal(result.mediaUrl, '/api/media/new-2'); assert.equal(result.status, 'draft');
  assert.deepEqual(clean(f.item), { ...before, mediaUrl: result.mediaUrl, status: 'draft' });
  for (const [key, value] of Object.entries(f.recipe)) assert.deepEqual(f.renders[0][key], value);
  assert.match(f.renders[0].imageUrl, /^data:image\/jpeg;base64,/);
  const assets = f.writes.filter(w => w[0] === 'asset').map(w => w[1]);
  assert.equal(assets.length, 2); assert.equal(assets[1].kind, 'social_creative'); assert.equal(assets[1].metadata.previousCreativeId, 'original');
  assert.deepEqual(clean(assets[1].metadata.pictureRecipe), f.recipe);
  assert.equal(assets[0].metadata.sourceAssetId, 'photo'); assert.equal(assets[0].metadata.sourceUrl, 'https://products.test/martinez');
  assert.deepEqual(f.writes.map(w => w[0]), ['asset', 'asset', 'item', 'audit']);
  assert.equal(f.writes.at(-1)[1].action, 'weekly.picture_replaced');
});
test('uploads and older saved layouts can be used without generation or publishing', async () => {
  const f = fixture({ legacy: true }); await f.replace({ assetId: undefined, upload: png });
  assert.equal(f.renders[0].headline, 'Original headline'); assert.equal(f.renders[0].designStyle, 'weekly-orbit');
  assert.equal(f.renders[0].format, 'portrait'); assert.equal(f.writes[0][1].provider, 'upload');
  assert.equal(f.writes[0][1].metadata.sourceAssetId, null);
  assert.equal(f.writes[0][1].metadata.productName, undefined, 'Do not invent product provenance for an upload');
});
test('foreign data, stale views, reels, pending changes, active deliveries and races never replace artwork', async () => {
  for (const options of [{ missing: true }, { foreignSource: true }, { noCreative: true }, { pendingChange: true }, { item: { type: 'reel_post' } }, { item: { status: 'scheduled' } }, { item: { status: 'published' } }, { delivery: true }, { raceDelivery: true }, ...['mediaUrl', 'caption', 'headline', 'status'].map(race => ({ race }))]) {
    const f = fixture(options); await assert.rejects(f.replace(), undefined, JSON.stringify(options)); assert.equal(f.writes.length, 0);
  }
  const stale = fixture(); await assert.rejects(stale.replace({ expectedMediaUrl: '/api/media/stale' }), /changed/); assert.equal(stale.renders.length, 0);
});
test('failed image decoding or rendering leaves the original approval and artwork unchanged', async () => {
  for (const options of [{ badPhoto: true }, { renderFailure: true }]) {
    const f = fixture(options); await assert.rejects(f.replace()); assert.equal(f.item.mediaUrl, '/api/media/original'); assert.equal(f.item.status, 'approved'); assert.equal(f.writes.length, 0);
  }
});
test('saved picture choices are business-scoped, deduplicated and do not expose raw media data', async () => {
  const f = fixture(); const choices = await f.pictureChoices(ctx, 'post');
  assert.equal(choices.length, 2); assert.equal(choices[0].label, 'Martinez'); assert.match(choices[0].src, /^\/api\/reels\/media\?assetId=photo/); assert.equal(choices[0].url, undefined); assert.equal(f.writes.length, 0);
});
test('picture normalization produces bounded JPEG and rejects unreadable uploads', async () => {
  const f = fixture(); const output = await f.normalizePicture(png); const meta = await sharp(Buffer.from(output.split(',')[1], 'base64')).metadata();
  assert.equal(meta.format, 'jpeg'); assert.ok(meta.width <= 2048);
  await assert.rejects(f.normalizePicture(Buffer.from('not-a-photo')), /could not be opened/);
  await assert.rejects(f.normalizePicture(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')), /could not be opened/);
  const transparent = await sharp({ create: { width: 20, height: 30, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.5 } } }).png().toBuffer();
  const normalized = await f.normalizePicture(transparent); assert.match(normalized, /^data:image\/png/);
  assert.equal((await sharp(Buffer.from(normalized.split(',')[1], 'base64')).metadata()).hasAlpha, true);
});

function routeFixture(viewer = false) {
  const calls = []; class PictureError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const api = load('app/api/weekly/items/[id]/picture/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/lib/auth/context': { tenantContext: async () => ({ ...ctx, role: viewer ? 'viewer' : 'member' }) },
    '@/lib/creative/replace-picture': { PictureError, pictureChoices: async () => { calls.push('list'); return []; }, replacePicture: async (ctx, id, body) => { calls.push(body); return { status: 'draft' }; } },
  });
  const send = (body, headers = {}) => api.POST(new Request('https://app.test/api/weekly/items/post/picture', { method: 'POST', headers: { origin: 'https://app.test', ...headers }, body }), { params: Promise.resolve({ id: 'post' }) });
  return { send, api, calls };
}
test('route rejects viewers, cross-origin requests, arbitrary URLs, malformed input and oversized bodies before editing', async () => {
  const valid = JSON.stringify({ expectedMediaUrl: '/api/media/original', assetId: 'photo' });
  for (const [viewer, body, headers, status] of [[true, valid, {}, 403], [false, valid, { origin: 'https://elsewhere.test' }, 403], [false, '{}', {}, 400], [false, 'bad json', {}, 400], [false, JSON.stringify({ expectedMediaUrl: '/api/media/original', assetId: 'photo', imageUrl: 'https://anything.test' }), {}, 400], [false, 'x'.repeat(8001), {}, 413]]) {
    const f = routeFixture(viewer); assert.equal((await f.send(body, headers)).status, status); assert.equal(f.calls.length, 0);
  }
  const f = routeFixture(true); assert.equal((await f.api.GET(new Request('https://app.test'), { params: Promise.resolve({ id: 'post' }) })).status, 403); assert.equal(f.calls.length, 0);
});
test('route accepts a saved selection or a limited uploaded photo without granting creative editing controls', async () => {
  const f = routeFixture(); assert.equal((await f.send(JSON.stringify({ assetId: 'photo', expectedMediaUrl: '/api/media/original' }))).status, 200);
  const form = new FormData(); form.set('expectedMediaUrl', '/api/media/original'); form.set('photo', new Blob([png], { type: 'image/png' }), 'guitar.png');
  assert.equal((await f.send(form)).status, 200); assert.ok(Buffer.isBuffer(f.calls[1].upload));
  for (const [type, bytes] of [['image/svg+xml', png], ['image/png', Buffer.alloc(3_000_001)]]) {
    const invalid = new FormData(); invalid.set('expectedMediaUrl', '/api/media/original'); invalid.set('photo', new Blob([bytes], { type }), 'invalid');
    assert.equal((await f.send(invalid)).status, 400);
  }
  assert.equal(f.calls.length, 2);
});

test('Admin can replace a photo while its customer change request is pending', async () => {
  const f = fixture({ pendingChange: true });
  const result = await f.replacePicture({ ...ctx, isSuperAdmin: true }, 'post', { assetId: 'photo', expectedMediaUrl: '/api/media/original' });
  assert.ok(result);
  assert.ok(f.writes.some(row => row[0] === 'item'));
});
