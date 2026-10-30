const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, Error, URL, Buffer, console, process: { env: {} }, require: name => name in mocks ? mocks[name] : require(name) });
  return module.exports;
}
const json = (body, options = {}) => ({ body, status: options.status || 200 });
const normalizedWebsite = value => { const url = new URL(/^https?:/.test(value) ? value : `https://${value}`); if (url.protocol !== 'https:' || url.username || url.password || url.port) throw Error('invalid'); return url.href; };
const request = (body, origin = 'https://rumi.test') => new Request('https://rumi.test/api/onboarding/complete', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function fixture({ role = 'owner', org = 'org-a', reviewOrg = 'org-a' } = {}) {
  const state = { membershipRole: role, products: [], assets: [], audits: [], updates: [], transactions: 0 };
  const brand = { id: 'brand-a', name: 'Current business', industry: 'Other', voice: 'Admin voice', logoUrl: 'existing-logo', headingFont: 'Keep this font', designStyle: 'Keep this template' };
  const setup = { website: 'https://shop.test/', brandName: 'My shop', logoUrl: 'read-logo', suggestions: { description: 'We make real products.', visualRules: 'Use original products.' }, products: [{ label: 'Original product', sourceUrl: 'https://shop.test/product/one', images: ['https://shop.test/front.png', 'https://shop.test/back.png', 'https://shop.test/detail.png'], family: 'One' }] };
  const tx = {
    brand: { findFirst: async ({ where }) => { assert.equal(where.organizationId, org); return brand; }, update: async ({ where, data }) => { assert.equal(where.id, brand.id); state.updates.push(data); return { ...brand, ...data }; } },
    membership: { updateMany() { throw Error('Must never change access role'); } },
    user: { update: async q => state.updates.push(q.data) },
    product: { findMany: async ({ where }) => { assert.equal(where.brandId, brand.id); return state.products; }, create: async ({ data }) => state.products.push(data) },
    mediaAsset: { findFirst: async ({ where }) => { assert.equal(where.organizationId, org); assert.equal(where.AND[0].metadata.equals, brand.id); return state.assets.find(asset => asset.metadata.sourceEvidence.imageUrl === where.AND[1].metadata.equals) || null; }, create: async ({ data }) => state.assets.push(data) },
    onboardingState: { upsert: async q => { assert.equal(q.where.organizationId, org); assert.equal(q.update.completed, true); } },
    auditLog: { create: async ({ data }) => state.audits.push(data) },
  };
  const prisma = { job: { findFirst: async ({ where }) => where.organizationId === reviewOrg ? { id: 'review', result: setup } : null }, $transaction: async fn => { state.transactions++; return fn(tx); } };
  const api = load('app/api/onboarding/complete/route.ts', { 'next/server': { NextResponse: { json } }, '@/lib/prisma': { prisma }, '@/lib/auth/context': { tenantContext: async () => ({ userId: 'user-a', organizationId: org, role, isSuperAdmin: false }) }, '@/lib/http/errors': { apiError: e => { throw e; } }, '@/lib/website/brand-profile': { normalizedWebsite } });
  return { api, state, setup, brand };
}

test('onboarding keeps access role, accepts simple website setup and stores professional role only as metadata', async () => {
  const f = fixture();
  const body = { brand: 'My shop', website: 'shop.test', websiteReviewId: 'review', role: 'superadmin', approvalRequired: false, headingFont: 'Override', designStyle: 'Override' };
  const response = await f.api.POST(request(body));
  assert.equal(response.status, 200); assert.equal(f.state.membershipRole, 'owner');
  const data = f.state.updates[0];
  assert.equal(data.approvalRequired, true); assert.equal(data.voice, 'Admin voice'); assert.equal(data.logoUrl, 'existing-logo');
  assert.equal('headingFont' in data, false); assert.equal('designStyle' in data, false);
  assert.equal(f.state.audits[0].metadata.professionalRole, 'superadmin');
  assert.equal(f.state.products.length, 1); assert.equal(f.state.assets.length, 3);
  for (const asset of f.state.assets) { assert.equal(asset.organizationId, 'org-a'); assert.equal(asset.campaignId, null); assert.equal(asset.metadata.brandId, 'brand-a'); assert.equal(asset.metadata.productName, 'Original product'); assert.equal(asset.metadata.sourceEvidence.sourceUrl, 'https://shop.test/product/one'); }
  await f.api.POST(request(body));
  assert.equal(f.state.products.length, 1, 'Repeated setup must preserve, not duplicate or replace products');
  assert.equal(f.state.assets.length, 3, 'Repeated setup reuses the original photo records');
});

test('viewers, members, foreign website reviews and changed identities cannot mutate onboarding', async () => {
  for (const role of ['viewer', 'member']) { const f = fixture({ role }); assert.equal((await f.api.POST({ json() { throw Error('No input read'); } })).status, 403); assert.equal(f.state.transactions, 0); }
  const foreign = fixture({ reviewOrg: 'org-b' });
  assert.equal((await foreign.api.POST(request({ brand: 'My shop', website: 'shop.test', websiteReviewId: 'foreign' }))).status, 409);
  assert.equal(foreign.state.transactions, 0);
  const changed = fixture();
  assert.equal((await changed.api.POST(request({ brand: 'Different business', website: 'shop.test', websiteReviewId: 'review' }))).status, 409);
  assert.equal(changed.state.transactions, 0);
  assert.equal((await changed.api.POST(request({ brand: 'My shop', website: 'shop.test' }, 'https://attacker.test'))).status, 403);
});

test('manual setup needs useful source information, validates websites, and does not require a paid website read', async () => {
  const f = fixture();
  assert.equal((await f.api.POST(request({ brand: 'My shop' }))).status, 400);
  assert.equal((await f.api.POST(request({ brand: 'My shop', website: 'http://shop.test' }))).status, 400);
  const result = await f.api.POST(request({ brand: 'My shop', description: 'We make handmade musical instruments.' }));
  assert.equal(result.status, 200); assert.equal(result.body.importedProducts, 0);
  assert.equal(f.state.products.length, 0); assert.equal(f.state.assets.length, 0);
});

test('completed businesses cannot be replaced by another identity and same-review retries remain safe', async () => {
  const f = fixture();
  Object.assign(f.brand, { onboardingCompleted: true, websiteUrl: 'https://shop.test/', name: 'My shop' });
  assert.equal((await f.api.POST(request({ brand: 'Another business', website: 'https://another.test/' }))).status, 409);
  assert.equal(f.state.updates.length, 0); assert.equal(f.state.assets.length, 0); assert.equal(f.state.products.length, 0);
  assert.equal((await f.api.POST(request({ brand: 'My shop', website: 'https://shop.test/', websiteReviewId: 'review' }))).status, 200);
  assert.equal(f.state.updates[0].logoUrl, 'existing-logo');
  await f.api.POST(request({ brand: 'My shop', website: 'https://shop.test/', websiteReviewId: 'review' }));
  assert.equal(f.state.products.length, 1); assert.equal(f.state.assets.length, 3);
});

test('identity extraction keeps actual logo and same-site product evidence without inventing logos or copying competitors', () => {
  const photos = load('lib/reels/product-photos.ts');
  const helper = load('lib/onboarding/website.ts', { '@/lib/reels/public-fetch': {}, '@/lib/website/brand-profile': {}, '@/lib/campaign/website-catalog': { catalogText: value => String(value).replace(/<[^>]+>/g, '').trim() }, '@/lib/reels/product-photos': photos, '@/lib/reels/product-identity': {} });
  const identity = helper.websiteIdentity(`<script type="application/ld+json">${JSON.stringify({ '@graph': [
    { '@type': 'Organization', logo: '/brand-logo.png' },
    { '@type': 'Product', name: 'Real guitar', url: '/product/real', image: ['/front.jpg', '/back.jpg'] },
    { '@type': 'Product', name: 'Other site', url: 'https://other.test/product/one', image: '/other.jpg' },
  ] })}</script><img src="/photo.jpg" alt="Product photo"><img class="site-logo" src="/second-logo.png">`, 'https://shop.test/');
  assert.deepEqual(Array.from(identity.logos), ['https://shop.test/brand-logo.png', 'https://shop.test/second-logo.png']);
  assert.equal(identity.products.length, 1); assert.equal(identity.products[0].label, 'Real guitar');
  assert.equal(identity.products[0].images.length, 2);
  assert.equal(helper.websiteIdentity('<h1>Business</h1><img src="/portrait.jpg">', 'https://shop.test/').logos.length, 0);
});

test('website setup checks gallery identity before adding extra product views', async () => {
  const photos = load('lib/reels/product-photos.ts'), checked = [];
  const helper = load('lib/onboarding/website.ts', {
    '@/lib/reels/public-fetch': { fetchPublicBytes: async url => ({ contentType: 'text/html', bytes: Buffer.from(url === 'https://shop.test/' ? '<h1>Our shop</h1>' : '<h1>Different model</h1><div class="woocommerce-product-gallery"><img src="/unrelated-front.jpg"><img src="/unrelated-back.jpg"></div>') }) },
    '@/lib/website/brand-profile': { normalizedWebsite },
    '@/lib/campaign/website-catalog': { catalogText: value => String(value).replace(/<[^>]+>/g, '').trim(), websiteCatalog: async () => [{ label: 'Original model', sourceUrl: 'https://shop.test/product/original', images: ['https://shop.test/original.jpg'], family: 'Original' }] },
    '@/lib/reels/product-photos': photos,
    '@/lib/reels/product-identity': { reelPhotoMatchesProduct: (subject, asset) => { checked.push({ subject, title: asset.metadata.sourceEvidence.title }); return false; } },
  });
  const result = await helper.readWebsiteSetup('shop.test', 'Our shop');
  assert.deepEqual(checked, [{ subject: 'Original model', title: 'Different model' }]);
  assert.deepEqual(Array.from(result.products[0].images), ['https://shop.test/original.jpg']);
});

test('website reading rejects viewers before fetching or saving reviews', async () => {
  const api = load('app/api/onboarding/website/route.ts', { 'next/server': { NextResponse: { json } }, '@/lib/prisma': { prisma: {} }, '@/lib/auth/context': { tenantContext: async () => ({ organizationId: 'org', role: 'viewer', isSuperAdmin: false }) }, '@/lib/http/errors': { apiError: e => { throw e; } }, '@/lib/security/rate-limit': {}, '@/lib/onboarding/website': {} });
  assert.equal((await api.POST({})).status, 403);
});
