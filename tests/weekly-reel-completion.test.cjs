const test = require('node:test'), assert = require('node:assert/strict');
const { load } = require('./helpers/weekly-load.cjs');
const { weeklyReelAction, ReelCompletionError } = load('lib/weekly/reel-completion.ts');
const { reelAssetId } = load('lib/reels/storage.ts');
const requestId = '11111111-1111-4111-8111-111111111111';
function fixture() {
  let state = { credits: 20, status: 'active', item: { id: 'item', campaignId: 'camp', status: 'draft' }, kind: 'motion_reel', jobs: [], ledger: [], assets: [], active: false }, tail = Promise.resolve();
  const belongs = q => q.where.organizationId === 'org';
  const tx = {
    $queryRaw: async () => [],
    contentItem: {
      findFirst: async q => q.where.id === state.item.id && q.where.campaign?.brand?.organizationId === 'org' ? state.item : null,
      update: async q => Object.assign(state.item, q.data),
    },
    job: {
      findUnique: async q => state.jobs.find(j => j.id === q.where.id) || null,
      findFirst: async q => {
        if (!belongs(q)) return null;
        if (q.where.type === 'WEEKLY_PACK') return { payload: { slots: [{ key: 'slot', kind: state.kind }] }, result: { items: [{ slotKey: 'slot', contentItemId: 'item' }] } };
        return state.jobs.find(j => j.type === q.where.type && (!q.where.id || j.id === q.where.id) && (!q.where.status || q.where.status.in.includes(j.status))) || null;
      },
      findMany: async q => state.jobs.filter(j => q.where.id.in.includes(j.id) && j.type === q.where.type && j.status === q.where.status),
      create: async q => { const j = { ...q.data, result: null }; state.jobs.push(j); return j; },
      update: async q => Object.assign(state.jobs.find(j => j.id === q.where.id), q.data),
    },
    subscription: {
      updateMany: async q => { if (!belongs(q) || state.credits < q.where.credits.gte || !q.where.status.in.includes(state.status)) return { count: 0 }; state.credits -= q.data.credits.decrement; return { count: 1 }; },
      findUniqueOrThrow: async () => ({ credits: state.credits }),
      update: async q => { state.credits += q.data.credits.increment; return { credits: state.credits }; },
    },
    creditLedger: { create: async q => state.ledger.push(q.data), findFirst: async q => state.ledger.find(l => Object.entries(q.where).every(([key, value]) => l[key] === value)) },
    publishJob: { findFirst: async () => state.active ? { id: 'published' } : null },
    mediaAsset: { findFirst: async q => state.assets.find(a => Object.entries(q.where).every(([key, value]) => a[key] === value)) || null },
  };
  const run = (input, org = 'org') => { const r = tail.then(async () => { const before = structuredClone(state); try { return await weeklyReelAction(tx, org, input); } catch (e) { state = before; throw e; } }); tail = r.catch(() => {}); return r; };
  function addAsset(pathname, contentType = 'video/mp4') { const a = { id: reelAssetId(pathname), organizationId: 'org', contentItemId: 'item', campaignId: 'camp', provider: 'reel-editor', kind: 'campaign_video', status: 'ready', url: '/saved', metadata: { pathname, contentType } }; state.assets.push(a); return a; }
  return { run, state: () => state, addAsset };
}
const reserve = { action: 'reserve', requestId, contentItemId: 'item', expectedCost: 4, consent: true };
test('repeat/concurrent finish clicks reserve once; exact MP4 completes as draft', async () => {
  const f = fixture(), [a,b] = await Promise.all([f.run(reserve), f.run(reserve)]);
  assert.equal(a.reservationId,b.reservationId); assert.equal(f.state().credits,16); assert.equal(f.state().ledger.length,1);
  const asset = f.addAsset(a.pathname);
  await f.run({ action:'complete', reservationId:a.reservationId, assetId:asset.id });
  assert.equal(f.state().item.status,'draft'); assert.equal(f.state().item.mediaUrl,'/api/video/media/'+asset.id);
  await f.run({ action:'complete', reservationId:a.reservationId, assetId:asset.id });
  await f.run({ action:'cancel', reservationId:a.reservationId });
  assert.equal(f.state().credits,16); assert.equal(f.state().ledger.length,1);
});
test('canceled attempts refund once and cannot complete or recharge under the same request', async () => {
  const f=fixture(), a=await f.run(reserve), asset=f.addAsset(a.pathname);
  await Promise.all([f.run({action:'cancel',reservationId:a.reservationId}),f.run({action:'cancel',reservationId:a.reservationId})]);
  assert.equal(f.state().credits,20); assert.equal(f.state().ledger.length,2);
  await assert.rejects(f.run({action:'complete',reservationId:a.reservationId,assetId:asset.id}),/no longer active/);
  assert.equal((await f.run(reserve)).restart,true);
});
test('foreign workspace, unrelated asset, WebM, scheduled posts, insufficient credits cannot complete', async () => {
  const f=fixture();
  await assert.rejects(f.run(reserve,'other'),/not found/);
  f.state().credits=3; await assert.rejects(f.run(reserve),/four available credits/); assert.equal(f.state().jobs.length,0);
  f.state().credits=20; const a=await f.run(reserve);
  const wrong=f.addAsset(a.pathname.replace(requestId,'22222222-2222-4222-8222-222222222222'));
  await assert.rejects(f.run({action:'complete',reservationId:a.reservationId,assetId:wrong.id}),/upload/);
  const webm=f.addAsset(a.pathname,'video/webm');
  await assert.rejects(f.run({action:'complete',reservationId:a.reservationId,assetId:webm.id}),/upload/);
  f.state().assets=f.state().assets.filter(x=>x.id!==webm.id); const mp4=f.addAsset(a.pathname); f.state().active=true;
  await assert.rejects(f.run({action:'complete',reservationId:a.reservationId,assetId:mp4.id}),/scheduled/);
  assert.equal(f.state().item.mediaUrl,undefined);
});
test('AI selection needs paid matching three completed scenes and never adds approval or another debit', async () => {
  const f=fixture(); f.state().kind='ai_video';
  f.state().jobs.push({id:requestId,organizationId:'org',type:'PRODUCT_REEL',status:'running',payload:{campaignId:'camp',contentItemId:'item'},result:{sceneIds:['s1','s2','s3']}});
  const asset=f.addAsset('reels/org/item/'+requestId+'.mp4');
  const input={action:'select-ai',contentItemId:'item',jobId:requestId,assetId:asset.id};
  await assert.rejects(f.run(input),/three AI scenes/);
  for(const id of ['s1','s2','s3']) f.state().jobs.push({id,organizationId:'org',type:'RUNWAY_VIDEO',status:'succeeded'});
  f.state().ledger.push({organizationId:'org',referenceId:requestId,reason:'product_reel',delta:-120});
  await f.run(input); await f.run(input);
  assert.equal(f.state().credits,20); assert.equal(f.state().item.status,'draft'); assert.equal(f.state().ledger.length,1);
  f.state().item.caption='A revised product story';
  await assert.rejects(f.run(input),/revised AI video/);
  assert.equal(f.state().ledger.length,1);
});
test('a changed reserved reel refunds once, commits its reset, and cannot select stale artwork', async () => {
  const f=fixture(), a=await f.run(reserve), asset=f.addAsset(a.pathname);
  f.state().item.headline='Revised product message';
  const reset=await f.run({action:'complete',reservationId:a.reservationId,assetId:asset.id});
  assert.equal(reset.restart,true); assert.equal(reset.refunded,true);
  assert.equal(f.state().credits,20); assert.equal(f.state().jobs[0].status,'canceled'); assert.equal(f.state().item.mediaUrl,undefined);
  assert.equal((await f.run(reserve)).restart,true); assert.equal(f.state().credits,20);
  const next=await f.run({...reserve,requestId:'22222222-2222-4222-8222-222222222222'});
  assert.notEqual(next.reservationId,a.reservationId); assert.equal(f.state().credits,16);
});
test('reserve resets a stale pending attempt before charging for its replacement', async () => {
  const f=fixture(); await f.run(reserve); f.state().item.mediaUrl='/api/image/media/new';
  const reset=await f.run({...reserve,requestId:'22222222-2222-4222-8222-222222222222'});
  assert.equal(reset.restart,true); assert.equal(f.state().credits,20); assert.equal(f.state().jobs.length,1);
});
test('completed reels remain idempotent but a revised post can produce a new version', async () => {
  const f=fixture(), a=await f.run(reserve), asset=f.addAsset(a.pathname);
  await f.run({action:'complete',reservationId:a.reservationId,assetId:asset.id});
  f.state().item.status='approved';
  assert.equal((await f.run(reserve)).alreadyCompleted,true); assert.equal(f.state().item.status,'approved');
  f.state().item.caption='New caption'; f.state().item.status='draft';
  assert.equal((await f.run({action:'complete',reservationId:a.reservationId,assetId:asset.id})).restart,true);
  assert.equal(f.state().credits,16); assert.equal((await f.run(reserve)).restart,true);
  const next=await f.run({...reserve,requestId:'22222222-2222-4222-8222-222222222222'});
  assert.equal(next.alreadyCompleted,false); assert.notEqual(next.pathname,a.pathname); assert.equal(f.state().credits,12);
});
