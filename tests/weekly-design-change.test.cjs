const { test } = require('node:test'), assert = require('node:assert/strict'), sharp = require('sharp');
const { load } = require('./helpers/weekly-load.cjs');
const ctx = { organizationId: 'org', userId: 'customer' }, clean = value => JSON.parse(JSON.stringify(value));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABQAAAAeCAIAAACjcKk8AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAKElEQVQ4jWPYuqSBbMQwqrlhNMAaRhNJw2jGaBgtDJaMFgZLhmdhAADG21TVuSmZnwAAAABJRU5ErkJggg==', 'base64');
const picture = 'data:image/png;base64,' + png.toString('base64');
function fixture(options = {}) {
  const writes = [], renders = [], openaiCalls = [];
  const item = { id: 'post', type: 'post', campaignId: 'campaign', headline: 'Post headline', caption: 'Original caption', status: 'approved', mediaUrl: '/api/media/original', scheduledFor: new Date('2026-11-05T12:00:00Z'), campaign: { brandId: 'brand', brand: { id: 'brand', name: 'Rumi Guitars' } }, ...options.item };
  const recipe = { headline: 'Artwork headline', subheadline: 'Supporting line', cta: 'Explore', brand: 'Rumi Guitars', logoUrl: 'saved-logo', designStyle: 'weekly-orbit', format: 'portrait', accentColor: '#aaee33' };
  const creative = { id: 'original', createdAt: new Date('2026-10-30'), url: 'old-artwork', metadata: { pictureRecipe: recipe, sourceAssetId: 'photo', ...(options.meta || {}) } };
  const pack = { id: 'pack', payload: { version: 1, brandId: 'brand', campaignId: 'campaign', weekStart: '2026-11-02', custom: 'retained', slots: [{ key: 'slot', layout: 'weekly-orbit', date: '2026-11-05', sourceImageUrl: 'https://old-plan.test/photo' }, { key: 'other', layout: 'weekly-banner' }] }, result: { items: [{ contentItemId: 'post', slotKey: 'slot' }] } };
  let reads = 0;
  const scoped = q => { assert.equal(q.where.organizationId, 'org'); assert.equal(q.where.campaignId, 'campaign'); assert.equal(q.where.contentItemId, 'post'); };
  const db = {
    contentItem: { findFirst: async q => { assert.equal(q.where.campaign.brand.organizationId, 'org'); reads++; return options.missing ? null : reads > 1 && options.race ? { ...item, [options.race]: 'changed' } : item; }, update: async q => { writes.push(['item', q.data]); Object.assign(item, q.data); } },
    publishJob: { findFirst: async q => { assert.equal(q.where.organizationId, 'org'); assert.ok(q.where.status.in.includes('verification_pending')); return options.delivery || (reads > 1 && options.raceDelivery) ? { id: 'delivery' } : null; } },
    job: {
      findFirst: async q => { assert.equal(q.where.organizationId, 'org'); return (q.where.type === 'WEEKLY_PACK' || q.where.type?.in?.includes('WEEKLY_PACK')) ? (options.noPack ? null : pack) : options.pendingChange ? { id: 'change' } : null; },
      update: async q => { writes.push(['pack', q.data]); assert.equal(q.where.id, 'pack'); },
    },
    mediaAsset: {
      findFirst: async q => { scoped(q); return q.where.id === 'original' ? (options.noCreative ? null : creative) : options.foreignPhoto ? null : { id: 'photo', url: options.badPhoto ? 'data:image/png;base64,not-image' : picture }; },
      findMany: async q => { scoped(q); assert.equal(q.where.createdAt.lte, creative.createdAt); return (options.sources || []).map(url => ({ url })); },
      create: async q => { writes.push(['asset', q.data]); return { id: 'new-design', ...q.data }; },
    },
    auditLog: { create: async q => { writes.push(['audit', q.data]); } },
    $transaction: async (fn, config) => { assert.equal(config.isolationLevel, 'Serializable'); return fn(db); },
  };
  const api = load('lib/creative/change-design.ts', {
    '@/lib/prisma': { prisma: db },
    '@/lib/render/svg': { renderSocialSvg: input => { renders.push(clean(input)); return 'svg'; } },
    '@/lib/render/raster': { logoToPngDataUrl: async () => 'saved-logo', weeklyDesignFonts: async () => ({ display: 'font', editorial: 'data:font/woff2;base64,Rk9OVA==', body: 'font' }), svgToPublishJpeg: async () => { if (options.renderFailure) throw Error('Export failed'); return sharp(png).jpeg().toBuffer(); } },
    openai: class OpenAI { constructor(config) { this.config = config; this.responses = { create: async input => { openaiCalls.push({ config: this.config, input: clean(input) }); return { output_text: options.aiOutput || JSON.stringify({ ideas: [{ layout: 'weekly-editorial', reason: 'Give the headline a more editorial presence.' }, { layout: 'quiet-luxury', reason: 'Use calmer color and more breathing room.' }, { layout: 'weekly-banner', reason: 'Make the product image feel more prominent.' }] }) }; } }; } },
    '@/lib/reels/public-fetch': { fetchPublicBytes: async () => { throw Error('Unexpected network'); } },
  });
  return { ...api, item, creative, recipe, pack, writes, renders, openaiCalls, change: (input = {}) => api.changeDesign(ctx, 'post', { expectedMediaUrl: '/api/media/original', layout: 'weekly-banner', ...input }), preview: (input = {}) => api.designChoices(ctx, 'post', { expectedMediaUrl: '/api/media/original', ...input }), ideas: (input = {}) => api.designIdeas(ctx, 'post', { expectedMediaUrl: '/api/media/original', direction: 'Make it feel polished and distinctive.', ...input }) };
}
test('layout change retains source, words, logo and date; resets approval and records new rotation without overwriting old artwork', async () => {
  const f = fixture(), before = clean(f.item), old = clean(f.creative), pack = clean(f.pack);
  const result = await f.change();
  assert.deepEqual(clean(result), { mediaUrl: '/api/media/new-design', status: 'draft' });
  assert.deepEqual(clean(f.item), { ...before, ...result }); assert.deepEqual(clean(f.creative), old);
  assert.deepEqual(f.renders[0], { ...f.recipe, designStyle: 'weekly-banner', imageUrl: f.renders[0].imageUrl, designFonts: { display: 'font', editorial: 'data:font/woff2;base64,Rk9OVA==', body: 'font' } });
  assert.match(f.renders[0].imageUrl, /^data:image\/jpeg;base64/);
  const meta = f.writes[0][1].metadata;
  assert.equal(meta.sourceAssetId, 'photo'); assert.equal(meta.previousCreativeId, 'original'); assert.equal(meta.customerChangedDesign, true);
  assert.deepEqual(clean(meta.pictureRecipe), { ...f.recipe, designStyle: 'weekly-banner' });
  assert.deepEqual(f.writes.map(row => row[0]), ['asset', 'item', 'pack', 'audit']);
  assert.deepEqual(clean(f.writes[2][1].payload), { ...pack.payload, slots: [{ ...pack.payload.slots[0], layout: 'weekly-banner' }, pack.payload.slots[1]] });
  assert.equal(f.writes[3][1].action, 'weekly.design_changed');
});
test('preview pages contain six distinct real choices, filters and enlarged previews with no writes', async () => {
  const f = fixture(), first = await f.preview(), last = await f.preview({ page: 14 });
  assert.equal(first.total, 91); assert.equal(first.pageCount, 16); assert.equal(first.choices.length, 6); assert.equal(first.currentDesign, 'weekly-orbit');
  assert.equal(last.choices.length, 6); assert.ok(!last.choices.some(choice => first.choices.some(row => row.id === choice.id)));
  const filtered = await f.preview({ family: first.choices[0].family }); assert.ok(filtered.choices.every(choice => choice.family === first.choices[0].family));
  const large = await f.preview({ layout: last.choices[5].id }); assert.equal(large.choices.length, 1); assert.equal(large.choices[0].id, last.choices[5].id);
  const luxury = await f.preview({ layout: 'quiet-luxury' }); assert.equal(luxury.choices[0].label, 'Quiet Luxury');
  assert.equal(f.renders.length, 13 + filtered.choices.length + 1); assert.equal(f.writes.length, 0);
  for (const render of f.renders) { assert.equal(render.headline, f.recipe.headline); assert.equal(render.logoUrl, 'saved-logo'); }
});
test('AI compares three distinct branded layout previews without changing the saved ad', async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  try {
    const f = fixture(), result = await f.ideas({ direction: 'Quiet luxury, bigger typography, less clutter.' });
    assert.deepEqual(clean(result.recommendations.map(choice => choice.id)), ['weekly-editorial', 'quiet-luxury', 'weekly-banner']);
    assert.ok(result.recommendations.every(choice => choice.src.startsWith('data:image/jpeg;base64,') && choice.reason.length > 10));
    assert.equal(f.writes.length, 0); assert.equal(f.renders.length, 3);
    assert.deepEqual(clean(f.renders.map(render => render.designStyle)), clean(result.recommendations.map(choice => choice.id)));
    assert.match(f.openaiCalls[0].input.input[1].content, /Quiet luxury, bigger typography/);
    assert.match(f.openaiCalls[0].input.input[1].content, /Rumi Guitars/);
    assert.equal(f.openaiCalls[0].config.maxRetries, 0);
    assert.equal(f.openaiCalls[0].input.store, false);
  } finally {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
test('AI design comparison rejects duplicate layouts and unavailable AI without writing', async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  try {
    const duplicate = fixture({ aiOutput: JSON.stringify({ ideas: [{ layout: 'weekly-banner', reason: 'one' }, { layout: 'weekly-banner', reason: 'two' }, { layout: 'quiet-luxury', reason: 'three' }] }) });
    await assert.rejects(duplicate.ideas(), /duplicate design ideas/);
    assert.equal(duplicate.writes.length, 0);
  } finally {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try { await assert.rejects(fixture().ideas(), /not configured/); }
  finally { if (original !== undefined) process.env.OPENAI_API_KEY = original; }
});
test('old ads use only an unambiguous saved photo and never guess from a plan or flattened design', async () => {
  for (const options of [{ meta: { sourceAssetId: null, sourceImageUrl: picture } }, { meta: { sourceAssetId: null }, sources: [picture, picture] }]) {
    const f = fixture(options); await f.change(); assert.match(f.renders[0].imageUrl, /^data:image\/jpeg/);
  }
  for (const sources of [[], [picture, 'another-photo']]) {
    const f = fixture({ meta: { sourceAssetId: null }, sources }); await assert.rejects(f.change(), /Replace picture/); assert.equal(f.writes.length, 0);
  }
  const unavailable = fixture({ foreignPhoto: true, meta: { sourceImageUrl: picture } }); await assert.rejects(unavailable.change(), /source photo is unavailable/);
});
test('quiet luxury can be applied to a saved ad without altering its source image or weekly layout rotation', async () => {
  const f = fixture();
  await f.change({ layout: 'quiet-luxury' });
  assert.equal(f.renders[0].designStyle, 'quiet-luxury');
  assert.equal(f.renders[0].designFonts.editorial, 'data:font/woff2;base64,Rk9OVA==');
  assert.match(f.renders[0].imageUrl, /^data:image\/jpeg/);
  assert.equal(f.writes.map(row => row[0]).join(','), 'asset,item,audit');
  assert.equal(f.writes[2][1].metadata.layout, 'quiet-luxury');
});
test('the current design can be refreshed without changing its layout or consuming paid generation', async () => {
  const f = fixture();
  await f.change({ layout: 'weekly-orbit' });
  assert.equal(f.renders[0].designStyle, 'weekly-orbit');
  assert.equal(f.writes[0][1].metadata.designStyle, 'weekly-orbit');
  assert.equal(f.writes[0][1].metadata.previousCreativeId, 'original');
  assert.equal(f.writes.map(row => row[0]).join(','), 'asset,item,pack,audit');
});
test('permissions, locks, stale snapshots, content races and export failures preserve the original', async () => {
  for (const options of [{ missing: true }, { noCreative: true }, { foreignPhoto: true }, { pendingChange: true }, { delivery: true }, { raceDelivery: true }, { badPhoto: true }, { renderFailure: true }, { item: { type: 'reel_post' } }, { item: { status: 'scheduled' } }, { item: { status: 'published' } }, ...['mediaUrl', 'headline', 'caption', 'status'].map(race => ({ race }))]) {
    const f = fixture(options), before = clean(f.item); await assert.rejects(f.change(), undefined, JSON.stringify(options)); assert.equal(f.writes.length, 0); assert.deepEqual(clean(f.item), before);
  }
  for (const input of [{ expectedMediaUrl: '/api/media/stale' }, { layout: 'unknown' }, { layout: 'unlisted-design' }]) {
    const f = fixture(); await assert.rejects(f.change(input)); assert.equal(f.writes.length, 0); assert.equal(f.renders.length, 0);
  }
  const f = fixture({ noPack: true }); await f.change(); assert.deepEqual(f.writes.map(row => row[0]), ['asset', 'item', 'audit']);
});
function routeFixture(viewer = false) {
  const calls = [];
  const api = load('app/api/weekly/items/[id]/design/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, ...options, status: options.status || 200 }) } },
    '@/lib/auth/context': { tenantContext: async () => ({ ...ctx, role: viewer ? 'viewer' : 'member' }) },
    '@/lib/creative/replace-picture': { PictureError: class extends Error {} },
    '@/lib/creative/change-design': { designChoices: async (ctx, id, input) => { calls.push(input); return []; }, changeDesign: async (ctx, id, input) => { calls.push(input); return { status: 'draft' }; } },
  });
  const params = { params: Promise.resolve({ id: 'post' }) }, base = 'https://app.test/api/weekly/items/post/design';
  return { calls, send: (body, origin = 'https://app.test') => api.POST(new Request(base, { method: 'POST', headers: { origin }, body }), params), get: query => api.GET(new Request(base + '?' + new URLSearchParams(query)), params) };
}
test('design route rejects read-only users, cross-origin writes, invalid layouts, arbitrary URLs and oversized requests', async () => {
  const valid = { expectedMediaUrl: '/api/media/original', layout: 'weekly-banner' };
  for (const [viewer, body, origin, status] of [[true, valid, undefined, 403], [false, valid, 'https://other.test', 403], [false, { ...valid, imageUrl: 'https://arbitrary.test' }, undefined, 400], [false, { ...valid, layout: 'not-a-design' }, undefined, 400], [false, 'bad json', undefined, 400], [false, 'x'.repeat(8001), undefined, 413]]) {
    const f = routeFixture(viewer); assert.equal((await f.send(typeof body === 'string' ? body : JSON.stringify(body), origin)).status, status); assert.equal(f.calls.length, 0);
  }
  const viewer = routeFixture(true); assert.equal((await viewer.get(valid)).status, 403);
  const f = routeFixture();
  for (const query of [{ page: -1 }, { page: 16 }, { page: 1.5 }, { family: 'unknown' }, { source: 'arbitrary' }, { layout: 'unknown' }]) assert.equal((await f.get({ expectedMediaUrl: valid.expectedMediaUrl, ...query })).status, 400);
  assert.equal(f.calls.length, 0);
  const preview = await f.get({ expectedMediaUrl: valid.expectedMediaUrl, page: 14 }); assert.equal(preview.status, 200); assert.equal(preview.headers['Cache-Control'], 'private, no-store');
  assert.equal((await f.get({ expectedMediaUrl: valid.expectedMediaUrl, layout: 'quiet-luxury' })).status, 200);
  assert.equal((await f.send(JSON.stringify(valid))).status, 200); assert.deepEqual(clean(f.calls[2]), valid);
});
function ideasRouteFixture(viewer = false, rateLimitOk = true) {
  const calls = [];
  const api = load('app/api/weekly/items/[id]/design/ideas/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, ...options, status: options.status || 200 }) } },
    '@/lib/auth/context': { tenantContext: async () => ({ ...ctx, role: viewer ? 'viewer' : 'member' }) },
    '@/lib/http/errors': { apiError: () => ({ status: 500 }) },
    '@/lib/security/rate-limit': { rateLimit: async () => ({ ok: rateLimitOk, remaining: rateLimitOk ? 7 : 0 }) },
    '@/lib/creative/replace-picture': { PictureError: class extends Error {} },
    '@/lib/creative/change-design': { designIdeas: async (context, id, input) => { calls.push({ context, id, input }); return { recommendations: [] }; } },
  });
  const params = { params: Promise.resolve({ id: 'post' }) }, endpoint = 'https://app.test/api/weekly/items/post/design/ideas';
  return { calls, send: (body, origin = 'https://app.test') => api.POST(new Request(endpoint, { method: 'POST', headers: { origin }, body: JSON.stringify(body) }), params) };
}
test('AI design route validates access, origin and direction before calling recommendations', async () => {
  const readonly = ideasRouteFixture(true);
  assert.equal((await readonly.send({ expectedMediaUrl: '/api/media/original', direction: 'A new editorial look' })).status, 403);
  const f = ideasRouteFixture();
  assert.equal((await f.send({ expectedMediaUrl: '/api/media/original', direction: 'A new editorial look' }, 'https://other.test')).status, 403);
  assert.equal((await f.send({ expectedMediaUrl: '/api/media/original', direction: 'x' })).status, 400);
  assert.equal(f.calls.length, 0);
  const result = await f.send({ expectedMediaUrl: '/api/media/original', direction: 'Quiet luxury with larger type' });
  assert.equal(result.status, 200);
  assert.deepEqual(f.calls[0].input, { expectedMediaUrl: '/api/media/original', direction: 'Quiet luxury with larger type' });
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
  const limited = ideasRouteFixture(false, false);
  assert.equal((await limited.send({ expectedMediaUrl: '/api/media/original', direction: 'Quiet luxury with larger type' })).status, 429);
  assert.equal(limited.calls.length, 0);
});
