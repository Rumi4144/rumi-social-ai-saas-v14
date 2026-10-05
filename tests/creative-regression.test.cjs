const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, cache = new Map()) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const requireFile = name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name);
      return load(base.endsWith('.ts') ? base : `${base}.ts`, mocks, cache);
    }
    return require(name);
  };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require: requireFile, process, Buffer, URL, console, fetch: mocks.__fetch || fetch, AbortSignal, FormData, Blob, Response, Uint8Array }, { filename: file });
  return module.exports;
}
const plan = load('lib/ai/visual-plan.ts');
const director = load('lib/ai/visual-director.ts');
const response = { NextResponse: { json: (body, options = {}) => ({ status: options.status || 200, json: async () => body }) } };

test('product campaign rotates all six subjects; services never get product heroes', () => {
  for (const context of [{ industry: 'Classical guitar retail' }, { businessType: 'service', description: 'Hypnotherapy and coaching' }]) {
    const history = []; const categories = [];
    for (let i = 0; i < 14; i++) { const c = plan.buildVisualConcept({ businessContext: context, variationIndex: i, recentConcepts: history }); categories.push(c.subjectCategory); history.push(c); }
    assert.equal(categories.some((c, i) => i && c === categories[i - 1]), false);
    if (context.businessType) { assert.equal(categories.includes('product'), false); assert.equal(new Set(categories).size, 5); }
    else { assert.equal(new Set(categories).size, 6); assert.ok(categories.filter(c => c === 'product').length <= 3); }
  }
});
test('service business context and previous motifs reach image prompt without another brand', () => {
  const context = { businessType: 'service', description: 'Hypnotherapy and confidence coaching' };
  const recentConcepts = [{ subjectCategory: 'environment', direction: 'An empty chair in a room' }];
  const concept = plan.buildVisualConcept({ businessContext: context, variationIndex: 0, recentConcepts });
  const prompt = director.buildVisualDirection({ brand: { name: 'Master Mind' }, businessContext: context, visualConcept: concept, recentConcepts, visualDirection: 'Another empty chair' });
  assert.match(prompt, /Primary subject category: human/);
  assert.match(prompt, /takes priority over conflicting/);
  assert.match(prompt, /An empty chair in a room/);
  assert.match(prompt, /Hypnotherapy/);
  assert.equal(prompt.includes('Rumi Guitars'), false);
});
test('uncertain businesses are not assigned an invented physical product', () => {
  assert.equal(plan.businessVisualMode({}), 'unknown');
  for (let i = 0; i < 12; i++) assert.notEqual(plan.buildVisualConcept({ businessContext: {}, variationIndex: i }).subjectCategory, 'product');
  assert.equal(plan.businessVisualMode({ industry: 'Furniture retail' }), 'product');
});
test('brand history queries enforce organization and matching brand campaigns', async () => {
  let campaignsQuery, jobsQuery;
  const prisma = { campaign: { findMany: async q => { campaignsQuery = q; return [{ id: 'brand-a-campaign' }]; } }, job: { findMany: async q => { jobsQuery = q; return [{ payload: { visualConcept: { subjectCategory: 'human' }, originalDirection: 'Performing' } }]; } } };
  const history = load('lib/ai/visual-history.ts', { '@/lib/prisma': { prisma } });
  await history.recentBrandConcepts('org-a', 'brand-a', new Date(100));
  assert.equal(campaignsQuery.where.brandId, 'brand-a'); assert.equal(campaignsQuery.where.brand.organizationId, 'org-a');
  assert.equal(jobsQuery.where.organizationId, 'org-a'); assert.equal(jobsQuery.where.OR[0].payload.equals, 'brand-a-campaign'); assert.equal(jobsQuery.where.createdAt.lt.getTime(), 100);
});
test('real clip validator rejects fake MIME, oversized and noncanonical payloads', () => {
  const clips = load('lib/video/clips.ts');
  const bytes = Buffer.alloc(32); bytes.write('ftyp', 4);
  assert.equal(clips.decodeClip(`data:video/mp4;base64,${bytes.toString('base64')}`).bytes.length, 32);
  assert.throws(() => clips.decodeClip(`data:video/webm;base64,${bytes.toString('base64')}`));
  assert.throws(() => clips.decodeClip('data:video/mp4;base64,YQ=='));
  assert.throws(() => clips.decodeClip(`data:video/mp4;base64,${Buffer.alloc(clips.MAX_CLIP_BYTES + 1).toString('base64')}`));
});
test('regeneration UI has no hard-coded guitar or no-people instruction', () => {
  const source = fs.readFileSync(path.join(root, 'components/RegenerateImageButton.tsx'), 'utf8');
  assert.equal(/classical guitar|Rumi Guitars|FE14|No people/.test(source), false);
});
test('regeneration rejects another tenant before making image-provider request', async () => {
  let calls = 0;
  class OpenAI { constructor() { calls++; } }
  const route = load('app/api/creative/generate-image/route.ts', { 'next/server': response, openai: OpenAI, '@/lib/auth/context': { tenantContext: async () => ({ organizationId: 'own-org' }) }, '@/lib/prisma': { prisma: { contentItem: { findFirst: async q => { assert.equal(q.where.campaign.brand.organizationId, 'own-org'); return null; } } } } });
  const result = await route.POST({ json: async () => ({ campaignId: 'other-campaign', contentItemId: 'other-item', prompt: 'Generate a fresh subject.' }) });
  assert.equal(result.status, 404); assert.equal(calls, 0);
});

test('video selection enforces ownership and resets approval; scheduled posts cannot change', async () => {
  let selected, active = false;
  const tx = {
    contentItem: { findFirst: async q => { assert.equal(q.where.campaign.brand.organizationId, 'own'); return { id: 'post', campaignId: 'campaign', status: 'approved' }; }, update: async q => { selected = q.data; } },
    mediaAsset: { findFirst: async q => { assert.equal(q.where.organizationId, 'own'); assert.equal(q.where.contentItemId, 'post'); return { id: 'clip', url: 'data:video/mp4;base64,abc' }; } },
    publishJob: { findFirst: async () => active ? { id: 'scheduled' } : null },
  };
  const route = load('app/api/video/select/route.ts', { 'next/server': response, '@/lib/auth/context': { tenantContext: async () => ({ organizationId: 'own', role: 'owner' }) }, '@/lib/prisma': { prisma: { $transaction: async fn => fn(tx) } } });
  const req = { json: async () => ({ contentItemId: 'post', assetId: 'clip' }) };
  assert.equal((await route.POST(req)).status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(selected)), { mediaUrl: '/api/video/media/clip', status: 'draft' });
  selected = null; active = true;
  assert.equal((await route.POST(req)).status, 409); assert.equal(selected, null);
  tx.mediaAsset.findFirst = async () => null;
  assert.equal((await route.POST(req)).status, 404);
});
test('Facebook videos keep their tenant boundary and reuse a confirmed upload', async () => {
  let state, calls = 0;
  const prisma = { mediaAsset: { findFirst: async q => { assert.equal(q.where.organizationId, 'own'); assert.equal(q.where.contentItemId, 'post'); return { id: 'clip', url: 'data:video/mp4;base64,abc' }; } }, job: { findFirst: async () => state, create: async q => { state = q.data; }, update: async q => { state = { ...state, ...q.data }; } } };
  const mod = load('lib/publishing/facebook-video.ts', { '@/lib/prisma': { prisma }, '@/lib/video/media': { videoBytes: async () => ({ bytes: Buffer.from('clip'), contentType: 'video/mp4' }) }, __fetch: async (url, init) => { calls++; assert.match(url, /graph-video.facebook.com/); assert.equal(init.body.get('description'), 'Caption'); assert.equal(init.body.get('source').type, 'video/mp4'); return new Response(JSON.stringify({ id: 'video-123' }), { status: 200 }); } });
  const args = { pageId: 'page', pageAccessToken: 'test', caption: 'Caption', assetId: 'clip', organizationId: 'own', contentItemId: 'post', publishJobId: 'publish' };
  assert.equal((await mod.publishFacebookVideo(args)).externalId, 'video-123');
  assert.equal((await mod.publishFacebookVideo(args)).externalId, 'video-123'); assert.equal(calls, 1);
  prisma.mediaAsset.findFirst = async () => null;
  assert.equal((await mod.publishFacebookVideo(args)).ok, false); assert.equal(calls, 1);
});
test('interrupted Facebook video upload is never automatically submitted again', async () => {
  let state, calls = 0;
  const prisma = { mediaAsset: { findFirst: async () => ({ id: 'clip', url: 'data:video/mp4;base64,abc' }) }, job: { findFirst: async () => state, create: async q => { state = q.data; } } };
  const mod = load('lib/publishing/facebook-video.ts', { '@/lib/prisma': { prisma }, '@/lib/video/media': { videoBytes: async () => ({ bytes: Buffer.from('clip'), contentType: 'video/mp4' }) }, __fetch: async () => { calls++; throw new Error('connection interrupted'); } });
  const args = { pageId: 'page', pageAccessToken: 'test', caption: '', assetId: 'clip', organizationId: 'own', contentItemId: 'post', publishJobId: 'publish' };
  assert.equal((await mod.publishFacebookVideo(args)).retryable, false);
  assert.equal((await mod.publishFacebookVideo(args)).retryable, false); assert.equal(calls, 1);
});
test('video URL routing cannot treat an external host as our private campaign clip', () => {
  const mod = load('lib/publishing/facebook-video.ts', { '@/lib/prisma': { prisma: {} }, '@/lib/video/media': {} });
  assert.equal(mod.campaignVideoId('/api/video/media/clip'), 'clip');
  assert.equal(mod.campaignVideoId('https://other.example/api/video/media/clip'), null);
});

test('scheduled video uses the selected clip and is claimed once before publishing', async () => {
  let calls = 0, claimed = true, updated;
  const job = { id: 'publish', organizationId: 'own', contentItemId: 'post', socialConnectionId: 'connection', platform: 'facebook', status: 'scheduled', attempts: 0 };
  const prisma = {
    publishJob: { findFirst: async () => job, updateMany: async () => ({ count: claimed ? 1 : 0 }), update: async q => { updated = q.data; } },
    socialConnection: { findUnique: async () => ({ organizationId: 'own', encryptedToken: 'test', externalId: 'page' }) },
    contentItem: { findUnique: async () => ({ id: 'post', status: 'scheduled', caption: 'Caption', mediaUrl: '/api/video/media/clip' }), update: async () => ({}) },
    publishAttempt: { create: async () => ({}) },
  };
  const mod = load('lib/publishing/process-due-job.ts', { '@/lib/prisma': { prisma }, '@/lib/publishing/providers': { publishToProvider: async args => { calls++; assert.equal(args.mediaUrl, '/api/video/media/clip'); assert.equal(args.organizationId, 'own'); assert.equal(args.publishJobId, 'publish'); return { ok: true, externalId: 'fb-video' }; } } });
  assert.equal((await mod.processDuePublishJob()).status, 'published'); assert.equal(updated.externalPostId, 'fb-video');
  claimed = false;
  assert.equal((await mod.processDuePublishJob()).status, 'idle'); assert.equal(calls, 1);
});
