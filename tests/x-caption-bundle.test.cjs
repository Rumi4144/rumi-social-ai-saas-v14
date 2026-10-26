const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const nextWebpack = require('next/dist/compiled/webpack/webpack');
const { getMainField } = require('next/dist/build/webpack-config-rules/resolve');

// CommonJS-only tests miss twitter-text's different ESM export shape. Execute
// the real validator using Next's production bundler and server ESM resolution.
test('X caption validator runs in the production server bundle', async () => {
  nextWebpack.init();
  const repo = path.resolve(__dirname, '..');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'x-caption-bundle-'));
  let compiler;
  try {
    const entry = path.join(temporary, 'entry.js');
    fs.writeFileSync(entry, ts.transpileModule(fs.readFileSync(path.join(repo, 'lib/x/publishing.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText);
    compiler = nextWebpack.webpack({
      mode: 'production', target: 'node', entry,
      optimization: { minimize: false },
      output: { path: temporary, filename: 'bundle.cjs', library: { type: 'commonjs2' } },
      resolve: { modules: [path.join(repo, 'node_modules'), 'node_modules'], mainFields: getMainField('server', true) },
      // No database, tokens, media preparation or outbound calls in this test.
      externals: [({ request }, callback) => request.startsWith('@/') || ['./connection', './media'].includes(request)
        ? callback(null, 'commonjs ' + request) : callback()],
    });
    const stats = await new Promise((resolve, reject) => compiler.run((error, result) => error ? reject(error) : resolve(result)));
    assert.equal(stats.hasErrors(), false, stats.toString({ all: false, errors: true }));
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(temporary, 'bundle.cjs'), 'utf8'), {
      module, exports: module.exports, URL, Buffer, console,
      require: name => name.startsWith('@/') || ['./connection', './media'].includes(name) ? {} : require(name),
    });
    const { xCaption } = module.exports;
    assert.equal(xCaption('Meet Rumi Guitars.', true), 'Meet Rumi Guitars.');
    assert.equal(xCaption('', true), '');
    assert.throws(() => xCaption('', false), /valid text/);
    assert.equal(xCaption('a'.repeat(280), false).length, 280);
    assert.throws(() => xCaption('a'.repeat(281), false), /281/);
    assert.doesNotThrow(() => xCaption('a'.repeat(256) + ' https://example.com/' + 'b'.repeat(1000), false));
    assert.throws(() => xCaption('界'.repeat(141), false), /282/);
    assert.doesNotThrow(() => xCaption('👨‍👩‍👧‍👦'.repeat(140), false));
    assert.equal(stats.hasWarnings(), false, stats.toString({ all: false, warnings: true }));
  } finally {
    if (compiler) await new Promise(resolve => compiler.close(resolve));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
