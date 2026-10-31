const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const full = path.resolve(__dirname, '..', file);
  const js = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    module, exports: module.exports,
    require: name => {
      if (name in mocks) return mocks[name];
      throw new Error('Unexpected dependency: ' + name);
    },
    process: { env: {} }, URL, URLSearchParams, FormData, Blob, Response,
    console: { log() {}, error() {} }, ...globals,
  });
  return module.exports;
}

test('Facebook resolves relative creatives and exports without losing the revision or query', () => {
  const { facebookImageUrl } = load('lib/publishing/facebook-image.ts');
  for (const source of ['/api/media/saved', '/api/media/saved/publish', 'https://rumisocialai.com/api/media/saved']) {
    assert.equal(facebookImageUrl(source + '?v=2').href, 'https://rumisocialai.com/api/media/saved/publish?v=2');
  }
  assert.equal(facebookImageUrl('https://images.example/photo.jpg?revision=3').href, 'https://images.example/photo.jpg?revision=3');
  assert.equal(facebookImageUrl('https://other.example/api/media/saved').href, 'https://other.example/api/media/saved');
  const custom = load('lib/publishing/facebook-image.ts', {}, { process: { env: { NEXT_PUBLIC_APP_URL: 'https://preview.example' } } });
  assert.equal(custom.facebookImageUrl('/api/media/saved').href, 'https://preview.example/api/media/saved/publish');
  for (const source of ['javascript:alert(1)', 'file:///private/photo.jpg', 'https://user:password@example.com/photo.jpg']) {
    assert.throws(() => facebookImageUrl(source), /public HTTPS/);
  }
});

function provider(fetch) {
  return load('lib/publishing/providers.ts', {
    './tiktok': {}, './x': {}, './google-business': {}, './youtube-campaign': {},
    './facebook-video': { campaignVideoId: () => null },
    './instagram-video': {}, './instagram': {},
    './facebook-image': load('lib/publishing/facebook-image.ts'),
    '@/lib/security/crypto': { decryptSecret: () => JSON.stringify({ pageAccessToken: 'test-token', pageId: 'page' }) },
  }, { fetch });
}

test('Facebook uploads the saved relative JPEG and attaches it to exactly one verified feed post', async () => {
  for (const mediaUrl of ['/api/media/saved', '/api/media/saved/publish']) {
    const calls = [];
    const { publishToProvider } = provider(async (url, init = {}) => {
      url = String(url); calls.push({ url, init });
      if (url.startsWith('https://graph.facebook.com/v23.0/me?')) return Response.json({ id: 'page' });
      if (url === 'https://rumisocialai.com/api/media/saved/publish') {
        return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1]), { headers: { 'content-type': 'image/jpeg' } });
      }
      if (url.endsWith('/page/photos')) {
        assert.equal(init.body.get('published'), 'false');
        assert.equal(init.body.get('source').type, 'image/jpeg');
        assert.equal(init.body.get('source').size, 4);
        return Response.json({ id: 'photo' });
      }
      if (url.endsWith('/page/feed')) {
        assert.equal(init.body.get('message'), 'Approved caption');
        assert.equal(init.body.get('attached_media[0]'), '{"media_fbid":"photo"}');
        return Response.json({ id: 'page_post' });
      }
      if (url.includes('/page_post?')) return Response.json({ id: 'page_post', is_published: true, permalink_url: 'https://facebook.com/page_post', attachments: { data: [{}] } });
      throw new Error('Unexpected request: ' + url);
    });
    const result = await publishToProvider({ platform: 'facebook', token: 'encrypted', externalAccountId: 'page', caption: 'Approved caption', mediaUrl });
    assert.equal(result.ok, true);
    assert.equal(result.externalId, 'page_post');
    assert.equal(calls.filter(call => call.url.endsWith('/page/feed')).length, 1);
    assert.equal(calls.length, 5);
  }
});

test('An unavailable saved creative never stages a photo or sends a Facebook feed post', async () => {
  const { publishToProvider } = provider(async (url, init = {}) => {
    assert.notEqual(init.method, 'POST');
    return String(url).includes('/me?') ? Response.json({ id: 'page' }) : new Response('', { status: 404 });
  });
  const result = await publishToProvider({ platform: 'facebook', token: 'encrypted', externalAccountId: 'page', caption: 'Approved caption', mediaUrl: '/api/media/missing' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'FACEBOOK_MEDIA_FETCH_FAILED_404');
});
