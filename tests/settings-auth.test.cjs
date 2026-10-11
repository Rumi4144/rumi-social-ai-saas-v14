const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('signed-out Google connection links lead to sign-in; signed-in requests proceed', () => {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../middleware.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URL, require: name => {
    if (name === '@/auth') return { auth: handler => handler };
    if (name === 'next/server') return { NextResponse: { redirect: url => ({ location: String(url) }), next: () => ({ next: true }) } };
    throw new Error(name);
  } });
  assert.ok(module.exports.config.matcher.includes('/settings/:path*'));
  for (const pathname of ['/settings', '/settings/google-business']) {
    const req = { nextUrl: { pathname }, url: `https://rumisocialai.com${pathname}` };
    assert.equal(module.exports.default(req).location, 'https://rumisocialai.com/login');
    assert.equal(module.exports.default({ ...req, auth: { user: { id: 'user' } } }).next, true);
  }
});
