const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, cache = new Map()) {
  file = path.resolve(root, file); if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
    { module, exports: module.exports, Buffer, process, URL, Date, console, require: name => name in mocks ? mocks[name] : name.startsWith('@/') || name.startsWith('.') ? load((name.startsWith('@/') ? name.slice(2) : path.relative(root, path.resolve(path.dirname(file), name))) + '.ts', mocks, cache) : require(name) });
  return module.exports;
}
const plan = load('lib/weekly/plan.ts');
const serialize = value => JSON.parse(JSON.stringify(value));
test('52 planned weeks supply 364 distinct angles without nearby design or photo repetition', () => {
  const history = [], angles = new Set(), layouts = [], sources = [];
  const photos = [1, 2, 3].map(n => ({ imageUrl: `https://brand.test/product-${n}.jpg`, sourceUrl: 'https://brand.test/products/one', productName: 'Original product' }));
  for (let week = 0; week < 52; week++) {
    const input = { organizationId: 'own', brandId: 'brand', brandName: 'Real business', weekStart: plan.addDays('2026-10-26', week * 7), startsOn: '2026-10-26', mix: { images: 6, motionReels: 1, aiVideos: 0 }, photos, history };
    const next = plan.planWeek(input);
    assert.deepEqual(serialize(next), serialize(plan.planWeek(input)), 'identical state has identical plans');
    assert.equal(next.weekNumber, week + 1); assert.equal(next.slots.length, 7);
    assert.equal(new Set(next.slots.map(slot => slot.date)).size, 7);
    for (const slot of next.slots) { assert.ok(!layouts.slice(-5).includes(slot.layout)); assert.notEqual(sources.at(-1), slot.sourceImageUrl); layouts.push(slot.layout); sources.push(slot.sourceImageUrl); angles.add(slot.topic); }
    history.push({ brandId: 'brand', weekStart: input.weekStart, slots: next.slots });
  }
  assert.equal(angles.size, 364); assert.equal(new Set(layouts).size, 12);
  const other = plan.planWeek({ organizationId: 'other', brandId: 'other', brandName: 'Other business', weekStart: '2026-10-26', startsOn: '2026-10-26', mix: { images: 7, motionReels: 0, aiVideos: 0 }, photos: [], history });
  assert.ok(other.slots.every(slot => !slot.sourceImageUrl && slot.topic.startsWith('Other business:')));
});
test('pack identity includes tenant, business and week; calendar handles a year boundary', () => {
  const keys = [plan.weeklyPackId('a', 'x', '2026-12-28'), plan.weeklyPackId('b', 'x', '2026-12-28'), plan.weeklyPackId('a', 'y', '2026-12-28'), plan.weeklyPackId('a', 'x', '2027-01-04')];
  assert.equal(new Set(keys).size, 4); assert.equal(plan.addDays('2026-12-28', 6), '2027-01-03'); assert.throws(() => plan.dateValue('2026-02-31'));
  assert.deepEqual(serialize(plan.annualPosition(plan.addDays('2026-10-26', 364), '2026-10-26')), { weekNumber: 1, cycle: 2 });
});
const productPhotos = (name, count) => Array.from({ length: count }, (_, index) => ({ imageUrl: `https://brand.test/${name}-${index}.jpg`, sourceUrl: `https://brand.test/products/${name}`, productName: name }));
const weeklyInput = (photos, mix = { images: 7, motionReels: 0, aiVideos: 0 }) => ({ organizationId: 'own', brandId: 'brand', brandName: 'Real business', weekStart: '2026-10-26', startsOn: '2026-10-26', photos, mix, history: [] });
test('weekly rotation selects products before photos, even with very uneven gallery sizes', () => {
  const input = weeklyInput([...productPhotos('guitar', 20), ...productPhotos('ukulele', 1), ...productPhotos('mandolin', 1)]);
  const slots = plan.planWeek(input).slots;
  assert.equal(new Set(slots.slice(0, 3).map(s => s.productName)).size, 3, 'Use all three products before repeating one');
  for (let i = 1; i < slots.length; i++) assert.notEqual(slots[i].productName, slots[i - 1].productName);
  const counts = ['guitar', 'ukulele', 'mandolin'].map(name => slots.filter(s => s.productName === name).length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, 'A large photo gallery must not dominate the week');
});
test('14- and 21-post packs use distinct products each day and reserve galleries for reels', () => {
  for (const [count, mix] of [[14, { images: 10, motionReels: 3, aiVideos: 1 }], [21, { images: 16, motionReels: 4, aiVideos: 1 }]]) {
    const input = weeklyInput([...productPhotos('guitar', 10), ...productPhotos('ukulele', 1), ...(count === 21 ? productPhotos('mandolin', 1) : [])], mix);
    const snapshot = JSON.stringify(input);
    const slots = plan.planWeek(input).slots;
    assert.equal(slots.length, count);
    for (let day = 1; day <= 7; day++) {
      const today = slots.filter(s => s.day === day);
      assert.equal(today.length, count / 7);
      assert.equal(new Set(today.map(plan.weeklyProductKey)).size, today.length, `Day ${day} must not feature one product twice`);
      assert.ok(today.every(s => s.date === plan.addDays(input.weekStart, day - 1)));
    }
    assert.equal(slots.filter(s => s.kind === 'motion_reel').length, mix.motionReels);
    assert.equal(slots.filter(s => s.kind === 'ai_video').length, mix.aiVideos);
    assert.ok(slots.filter(s => s.kind !== 'image').every(s => s.productName === 'guitar'), 'Only the guitar has enough real views for a reel');
    assert.equal(JSON.stringify(input), snapshot, 'Planning must not rewrite saved history or catalog order');
    assert.deepEqual(serialize(slots), serialize(plan.planWeek(input).slots));
  }
});
test('product rotation carries across weeks without using another business or a future pack', () => {
  const input = weeklyInput([...productPhotos('guitar', 10), ...productPhotos('ukulele', 1), ...productPhotos('mandolin', 1)]);
  input.history = [{ brandId: 'brand', weekStart: '2026-10-19', slots: ['guitar', 'ukulele', 'mandolin'].map(name => ({ ...productPhotos(name, 1)[0], sourceImageUrl: productPhotos(name, 1)[0].imageUrl, layout: 'cinematic' })) }];
  const expected = plan.planWeek(input);
  assert.equal(expected.slots[0].productName, 'guitar', 'The least recently featured product goes first');
  input.history.push({ ...input.history[0], brandId: 'other', weekStart: '2026-10-25', slots: input.history[0].slots.slice().reverse() }, { ...input.history[0], weekStart: '2026-11-02', slots: input.history[0].slots.slice().reverse() });
  assert.deepEqual(serialize(plan.planWeek(input)), serialize(expected));
});
test('tracking links and resized photographs cannot masquerade as extra products or reel scenes', () => {
  const photo = productPhotos('guitar', 1)[0];
  const variants = [photo, { ...photo, productName: '  GUITAR  ', sourceUrl: `${photo.sourceUrl}/?utm_source=ad&fbclid=123#gallery`, imageUrl: `${photo.imageUrl}?width=600` }, { ...photo, sourceUrl: `${photo.sourceUrl}?gclid=123`, imageUrl: `${photo.imageUrl}?quality=80` }];
  assert.equal(plan.photoGroups(variants).length, 1);
  assert.equal(plan.photoGroups(variants)[0].length, 1, 'One photo in three sizes is not a gallery');
  assert.notEqual(plan.weeklyProductKey(photo), plan.weeklyProductKey({ ...photo, sourceUrl: photo.sourceUrl + '?variant=blue' }), 'Meaningful product variants remain distinct');
  assert.equal(plan.photoGroups([photo, { ...photo, productName: 'Different product' }]).length, 2, 'A shared catalog page must not combine differently named products');
});
test('small catalogs keep the promised quantities without inventing products', () => {
  const input = weeklyInput(productPhotos('guitar', 3), { images: 10, motionReels: 3, aiVideos: 1 });
  const slots = plan.planWeek(input).slots;
  assert.equal(slots.length, 14);
  assert.ok(slots.every(s => s.productName === 'guitar' && input.photos.some(p => p.imageUrl === s.sourceImageUrl)));
  assert.equal(new Set(slots.map(s => s.date)).size, 7);
});
function fixture({ credits = 100, planName = 'starter', status = 'trialing', gallery = false } = {}) {
  let queue = Promise.resolve(), sequence = 0;
  const state = { subscription: { organizationId: 'own', plan: planName, status, credits }, jobs: [], campaigns: [], ledger: [], items: [], assets: [], deliveries: [], locks: [] };
  const brands = ['brand', 'second'].map(id => ({ id, organizationId: 'own', name: `Business ${id}`, logoUrl: 'https://brand.test/logo.png', websiteUrl: 'https://brand.test', createdAt: new Date(), products: gallery ? [1, 2, 3].map(n => ({ name: 'Martinez MF-17', sourceUrl: 'https://brand.test/products/mf-17', imageUrl: `https://brand.test/guitar-${n}.jpg` })) : [], voice: 'clear', description: 'Guitars', industry: 'retail' }));
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === 'payload') return value.path.reduce((v, key) => v?.[key], row.payload) === value.equals;
    if (key === 'OR') return value.some(choice => matches(row, choice));
    if (key === 'campaign') return true;
    if (key === 'scheduledFor') return true;
    if (value && typeof value === 'object') { if ('in' in value) return value.in.includes(row[key]); if ('not' in value) return row[key] !== value.not; if ('gte' in value) return row[key] >= value.gte; }
    return row[key] === value;
  });
  const db = {
    brand: { findMany: async query => { assert.equal(query.where.organizationId, 'own'); return brands; } },
    campaign: { findMany: async query => { assert.equal(query.where.brand.organizationId, 'own'); return state.campaigns.filter(c => c.brandId === query.where.brandId); }, create: async ({ data }) => { const row = { id: `campaign-${++sequence}`, ...data }; state.campaigns.push(row); return row; } },
    subscription: { findUnique: async ({ where }) => { assert.equal(where.organizationId, 'own'); return { ...state.subscription }; }, findUniqueOrThrow: async () => ({ ...state.subscription }), updateMany: async ({ where, data }) => { if (!matches(state.subscription, where)) return { count: 0 }; state.subscription.credits -= data.credits.decrement; return { count: 1 }; } },
    job: { findMany: async ({ where }) => { assert.equal(where.organizationId, 'own'); return state.jobs.filter(row => matches(row, where)); }, findFirst: async ({ where }) => { assert.equal(where.organizationId, 'own'); return state.jobs.find(row => matches(row, where)) || null; }, create: async ({ data }) => { assert.ok(!state.jobs.some(job => job.id === data.id)); const row = { status: 'queued', createdAt: new Date(), updatedAt: new Date(), ...data }; state.jobs.push(row); return row; } },
    creditLedger: { create: async ({ data }) => { state.ledger.push(data); return data; } },
    mediaAsset: { findMany: async query => { assert.equal(query.where.organizationId, 'own'); return state.assets.filter(row => matches(row, query.where)); } },
    contentItem: { findMany: async query => { assert.equal(query.where.campaign.brand.organizationId, 'own'); return state.items.filter(item => matches(item, query.where)); } },
    publishJob: { findMany: async query => { assert.equal(query.where.organizationId, 'own'); return state.deliveries.filter(row => matches(row, query.where)); } },
    socialConnection: { findMany: async query => { assert.equal(query.where.organizationId, 'own'); return []; } },
    $queryRaw: async (parts, organizationId) => { assert.equal(organizationId, 'own'); assert.match(parts.join('?'), /FOR UPDATE/); state.locks.push(organizationId); return [{ id: 'subscription' }]; },
  };
  db.$transaction = async callback => {
    const previous = queue; let release; queue = new Promise(resolve => release = resolve); await previous;
    const before = { credits: state.subscription.credits, campaigns: state.campaigns.length, jobs: state.jobs.length, ledger: state.ledger.length };
    try { return await callback(db); } catch (error) { state.subscription.credits = before.credits; state.campaigns.length = before.campaigns; state.jobs.length = before.jobs; state.ledger.length = before.ledger; throw error; } finally { release(); }
  };
  const service = load('lib/weekly/service.ts', { '@/lib/prisma': { prisma: db }, '@/lib/video/runway': { runwayConfigured: () => false } });
  const request = changes => ({ action: 'prepare', requestId: '00000000-0000-4000-8000-000000000001', brandId: 'brand', weekStart: plan.monday(), expectedCredits: 15, ...changes });
  const context = { organizationId: 'own', userId: 'user', role: 'owner' };
  return { state, db, service, request, context };
}
const savedPost = (id, campaignId, date = plan.monday()) => ({ id, campaignId, type: 'post', headline: id, caption: 'Saved copy', status: 'draft', platform: 'facebook,instagram,youtube', mediaUrl: null, scheduledFor: new Date(`${date}T12:00:00Z`), createdAt: new Date() });
test('55 older drafts never become an unprepared weekly pack or trigger any work', async () => {
  const f = fixture();
  f.state.items.push(...Array.from({ length: 55 }, (_, i) => savedPost(`older-${i}`, `older-campaign-${i % 3}`)));
  const before = JSON.stringify(f.state);
  f.db.contentItem.findMany = async () => { throw new Error('An unprepared week must not load older campaign drafts'); };
  const view = await f.service.weeklyView(f.context);
  assert.equal(view.pack, null); assert.equal(view.items.length, 0); assert.equal(view.prepare.allowed, true);
  assert.equal(view.plan.weeklyPosts, 7);
  assert.equal(view.prepare.mix.images + view.prepare.mix.motionReels + view.prepare.mix.aiVideos, 7);
  assert.equal(JSON.stringify(f.state), before, 'Opening This Week preserves every saved draft, date, status and credit');
});
test('a seven-day pack stays seven posts across three social accounts, with no legacy or duplicate additions', async () => {
  const f = fixture();
  f.db.socialConnection.findMany = async () => ['facebook', 'instagram', 'youtube'].map(provider => ({ provider }));
  const result = await f.service.prepareWeekly(f.context, f.request());
  const pack = f.state.jobs.find(job => job.type === 'WEEKLY_PACK');
  const generation = f.state.jobs.find(job => job.type === 'CREATE_EVERYTHING');
  assert.equal(generation.payload.contentPlan.length, 7);
  assert.equal(generation.payload.dailyPlan.length, 7);
  assert.ok(generation.payload.contentPlan.every(slot => slot.platforms.length === 3));
  pack.result = { items: pack.payload.slots.map((slot, i) => ({ slotKey: slot.key, contentItemId: `weekly-${i}` })) };
  f.state.items.push(...pack.payload.slots.map((slot, i) => savedPost(`weekly-${i}`, result.campaignId, slot.date)));
  f.state.items.push(...Array.from({ length: 55 }, (_, i) => savedPost(`older-${i}`, 'older-campaign')),
    savedPost('extra-in-same-campaign', result.campaignId), savedPost('duplicate-slot', result.campaignId));
  pack.result.items.push({ slotKey: pack.payload.slots[0].key, contentItemId: 'duplicate-slot' }, { slotKey: 'unplanned', contentItemId: 'extra-in-same-campaign' });
  const before = JSON.stringify(f.state);
  const view = await f.service.weeklyView(f.context);
  assert.equal(view.items.length, 7); assert.equal(new Set(view.items.map(item => item.date)).size, 7);
  assert.ok(view.items.every(item => item.id.startsWith('weekly-')));
  assert.equal(JSON.stringify(f.state), before);
  f.state.items[0].status = 'published';
  assert.equal((await f.service.weeklyView(f.context)).items.length, 6, 'Published slots are not refilled with older drafts');
  await f.service.prepareWeekly(f.context, f.request());
  assert.equal(f.state.ledger.length, 1); assert.equal(f.state.campaigns.length, 1);
  assert.equal(f.state.items.filter(item => item.id.startsWith('older-')).length, 55, 'Admin history remains saved');
});
test('a paid larger pack remains intact after the customer changes plans', async () => {
  const f = fixture({ planName: 'business', status: 'active' });
  const result = await f.service.prepareWeekly(f.context, f.request({ expectedCredits: 29 }));
  const pack = f.state.jobs.find(job => job.type === 'WEEKLY_PACK');
  pack.result = { items: pack.payload.slots.map((slot, i) => ({ slotKey: slot.key, contentItemId: `paid-${i}` })) };
  f.state.items.push(...pack.payload.slots.map((slot, i) => savedPost(`paid-${i}`, result.campaignId, slot.date)));
  f.state.subscription.plan = 'starter';
  const view = await f.service.weeklyView(f.context);
  assert.equal(view.plan.weeklyPosts, 7); assert.equal(view.items.length, 14);
  assert.equal(f.state.ledger.length, 1, 'Viewing a saved pack never prepares or charges a replacement');
});
test('concurrent preparation retries claim one pack and debit exactly once', async () => {
  const f = fixture(); const results = await Promise.all([f.service.prepareWeekly(f.context, f.request()), f.service.prepareWeekly(f.context, f.request())]);
  assert.equal(results[0].packId, results[1].packId); assert.equal(results.filter(r => r.reused).length, 1); assert.equal(f.state.ledger.length, 1); assert.equal(f.state.subscription.credits, 85); assert.equal(f.state.campaigns.length, 1);
  assert.equal(f.state.jobs.filter(job => job.type === 'CREATE_EVERYTHING').length, 1);
  assert.equal(f.state.jobs.find(job => job.type === 'WEEKLY_PACK').payload.slots.length, 7);
});
test('annual plan keeps its original start when a future week is prepared first', async () => {
  const f = fixture({ status: 'active' }), start = plan.monday();
  const future = plan.addDays(start, 21);
  await f.service.prepareWeekly(f.context, f.request({ weekStart: future }));
  assert.equal(f.state.jobs.find(job => job.type === 'WEEKLY_PACK').payload.startsOn, start);
  const view = await f.service.weeklyView(f.context, { weekStart: future });
  assert.equal(view.weekNumber, 4); assert.equal(view.annualPlan.startsOn, start);
  await f.service.prepareWeekly(f.context, f.request({ requestId: '00000000-0000-4000-8000-000000000002' }));
  assert.equal((await f.service.weeklyView(f.context)).weekNumber, 1);
  assert.equal(plan.annualStart([{ weekStart: future, weekNumber: 4, cycle: 1 }]), start);
});
test('organization quota cannot be bypassed through a second brand and trial cannot repeat next week', async () => {
  const f = fixture(); await f.service.prepareWeekly(f.context, f.request());
  await assert.rejects(f.service.prepareWeekly(f.context, f.request({ brandId: 'second', requestId: '00000000-0000-4000-8000-000000000002' })), /trial includes one/);
  await assert.rejects(f.service.prepareWeekly(f.context, f.request({ weekStart: plan.addDays(plan.monday(), 7), requestId: '00000000-0000-4000-8000-000000000003' })), /trial includes one/);
  assert.equal(f.state.ledger.length, 1);
  const paid = fixture({ status: 'active' }); await paid.service.prepareWeekly(paid.context, paid.request());
  await assert.rejects(paid.service.prepareWeekly(paid.context, paid.request({ brandId: 'second', requestId: '00000000-0000-4000-8000-000000000002' })), /weekly allowance/);
});
test('foreign business, viewer, stale quote, inactive subscription and insufficient credits never create a pack', async () => {
  for (const [options, context, request, expected] of [[{}, {}, { brandId: 'foreign' }, /not found/], [{}, { role: 'viewer' }, {}, /read-only/], [{}, {}, { expectedCredits: 14 }, /cost changed/], [{ status: 'canceled' }, {}, {}, /active plan/], [{ credits: 14 }, {}, {}, /not enough credits/]]) {
    const f = fixture(options); await assert.rejects(f.service.prepareWeekly({ ...f.context, ...context }, f.request(request)), expected); assert.equal(f.state.ledger.length, 0); assert.equal(f.state.campaigns.length, 0);
  }
});
test('reels are quoted only with three actual product views; stored copy topics retain exact product identity', async () => {
  const previous = process.env.BLOB_READ_WRITE_TOKEN; process.env.BLOB_READ_WRITE_TOKEN = 'test-only-no-network';
  try {
  const f = fixture(); const view = await f.service.weeklyView(f.context); assert.equal(view.prepare.mix.images, 7); assert.equal(view.prepare.mix.motionReels, 0);
  await assert.rejects(f.service.prepareWeekly(f.context, f.request({ mix: { images: 6, motionReels: 1, aiVideos: 0 } })), /Three distinct saved photos/); assert.equal(f.state.ledger.length, 0);
  const g = fixture({ gallery: true }); await g.service.prepareWeekly(g.context, g.request());
  const generation = g.state.jobs.find(job => job.type === 'CREATE_EVERYTHING'); assert.equal(g.state.subscription.credits, 85);
  assert.ok(generation.payload.contentPlan.every(slot => slot.topics[0] === 'Martinez MF-17'));
  assert.equal(g.state.jobs.find(job => job.type === 'WEEKLY_PACK').payload.completionCredits, 4);
  } finally { if (previous === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = previous; }
});
test('weekly views retain partial failures and distinguish source image previews from finished reels', async () => {
  const previous = process.env.BLOB_READ_WRITE_TOKEN; process.env.BLOB_READ_WRITE_TOKEN = 'test-only-no-network';
  try {
  const f = fixture({ gallery: true }); const created = await f.service.prepareWeekly(f.context, f.request());
  const pack = f.state.jobs.find(job => job.type === 'WEEKLY_PACK'), reelSlot = pack.payload.slots.find(slot => slot.kind === 'motion_reel');
  pack.result = { items: [{ slotKey: reelSlot.key, contentItemId: 'reel' }] };
  f.state.items.push({ id: 'reel', campaignId: created.campaignId, type: 'reel_post', headline: 'A closer look', caption: 'A product view', status: 'published', platform: 'facebook,instagram', mediaUrl: '/api/media/photo', scheduledFor: new Date(), createdAt: new Date() });
  f.state.assets.push({ id: 'photo', organizationId: 'own', campaignId: created.campaignId, contentItemId: 'reel', kind: 'social_creative', status: 'ready', url: 'data:image/jpeg;base64,YQ==' });
  f.state.deliveries.push(...['published', 'failed'].map((status, n) => ({ id: `delivery-${n}`, organizationId: 'own', contentItemId: 'reel', socialConnectionId: `account-${n}`, platform: n ? 'instagram' : 'facebook', status, scheduledFor: new Date(), createdAt: new Date(), lastError: status === 'failed' ? 'Try again' : null, publishedAt: status === 'published' ? new Date() : null })));
  const view = await f.service.weeklyView(f.context); assert.equal(view.items.length, 1); assert.equal(view.items[0].isReady, false); assert.equal(view.items[0].mediaKind, 'image'); assert.equal(view.items[0].downloadUrl, null); assert.equal(view.items[0].needsAttention, true);
  f.state.deliveries[1].status = 'published'; assert.equal((await f.service.weeklyView(f.context)).items.length, 0);
  } finally { if (previous === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = previous; }
});
test('unconfigured AI video is replaced with an image and cannot be explicitly charged', async () => {
  const f = fixture({ gallery: true, planName: 'business', status: 'active', credits: 1500 });
  const view = await f.service.weeklyView(f.context); assert.equal(view.prepare.aiVideoAvailable, false); assert.equal(view.prepare.mix.aiVideos, 0);
  await assert.rejects(f.service.prepareWeekly(f.context, f.request({ expectedCredits: 29, mix: { images: 13, motionReels: 0, aiVideos: 1 } })), /not configured/);
  assert.equal(f.state.ledger.length, 0);
});
test('a small catalog explains unavoidable same-day repeats before preparation', async () => {
  const f = fixture({ gallery: true, planName: 'business', status: 'active', credits: 1500 });
  const view = await f.service.weeklyView(f.context);
  assert.ok(view.prepare.warnings.some(text => /Some products will repeat that day/.test(text)));
  const intro = fixture({ gallery: true, status: 'active' });
  assert.ok(!(await intro.service.weeklyView(intro.context)).prepare.warnings.some(text => /repeat that day/.test(text)));
  assert.equal(f.state.ledger.length, 0);
});
test('a newer retry outcome controls each account independently of an older success', () => {
  const { service } = fixture(); const rows = service.latestDeliveries([{ socialConnectionId: 'a', status: 'published', createdAt: new Date(1) }, { socialConnectionId: 'a', status: 'failed', createdAt: new Date(2) }, { socialConnectionId: 'b', status: 'published', createdAt: new Date(3) }]);
  assert.equal(rows.length, 2); assert.equal(service.fullyPublished('published', rows), false);
});
test('recovery reuses only confirmed results and original photos, with a strict retry limit', () => {
  const { weeklyRetryReason } = load('lib/weekly/recovery.ts');
  const job = { organizationId: 'own', id: 'image', type: 'GENERATE_IMAGE', status: 'failed', attempts: 1, payload: {}, result: null };
  assert.equal(weeklyRetryReason({ ...job, payload: { sourceImageUrl: 'https://brand.test/photo.jpg' } }), null);
  assert.equal(weeklyRetryReason(job, { organizationId: 'own', status: 'succeeded', result: { base64: 'confirmed' } }), null);
  assert.match(weeklyRetryReason(job, { organizationId: 'other', status: 'succeeded', result: { base64: 'foreign' } }), /not confirmed/);
  assert.match(weeklyRetryReason(job, { organizationId: 'own', status: 'submitting', result: {} }), /not confirmed/);
  assert.match(weeklyRetryReason({ ...job, attempts: 3, payload: { sourceImageUrl: 'https://brand.test/photo.jpg' } }), /retry limit/);
  assert.equal(weeklyRetryReason({ ...job, type: 'CREATE_EVERYTHING', result: { generatedPack: { posts: [] } } }), null);
  assert.match(weeklyRetryReason({ ...job, type: 'CREATE_EVERYTHING' }), /no saved copy/);
});
test('new weekly layouts preserve original logo and photo across export sizes without injected markup', () => {
  const { WEEKLY_DESIGNS, renderWeeklyDesign } = load('lib/render/weekly-layouts.ts');
  const designs = new Set(), photoCompositions = new Set();
  for (const style of WEEKLY_DESIGNS) for (const [format, height] of [['square',1080],['portrait',1350],['story',1920]]) {
    const svg = renderWeeklyDesign({ brand:'Actual & Business', headline:'Find your sound', cta:'Learn more', imageUrl:'data:image/png;base64,PHOTO', logoUrl:'data:image/png;base64,LOGO', primaryColor:'bad" onload="alert(1)', accentColor:'#fe5739', format },style);
    assert.match(svg,new RegExp(`height="${height}"`)); assert.match(svg,/data:image\/png;base64,PHOTO/); assert.match(svg,/data:image\/png;base64,LOGO/); assert.match(svg,/ACTUAL &amp; BUSINESS/);
    assert.ok(!/onload=|NaN|undefined|<script/.test(svg)); assert.ok([...svg.matchAll(/font-size="([0-9]+)"/g)].some(m=>Number(m[1])>=110)); assert.equal((svg.match(/<image /g)||[]).length,2);
    if(format==='portrait'){designs.add(svg);photoCompositions.add(svg.match(/<image href="data:image\/png;base64,PHOTO"[^>]+/)[0]);}
  }
  assert.equal(designs.size,5);assert.equal(photoCompositions.size,5,'The five formats must change the photograph composition, not just border decoration');
});
