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
  vm.runInNewContext(js, { module, exports: module.exports, require: requireFile, process, Buffer, URL, console, fetch: mocks.__fetch || fetch, AbortSignal, FormData, Blob, Response, Uint8Array, Headers, ReadableStream, setTimeout, clearTimeout }, { filename: file });
  return module.exports;
}


const {PROFILE_FIELDS,verifiedProfile,normalizedWebsite}=load('lib/website/brand-profile.ts');
const draft=()=>Object.fromEntries(PROFILE_FIELDS.map(field=>[field,{value:'',quote:'',sourceUrl:''}]));
const pages=[{url:'https://mind.example/',text:'Our hypnosis sessions support personal development. We offer appointments for adults interested in stress management.'}];
test('only website-supported profile suggestions are accepted',()=>{const data=draft();data.description={value:'Hypnosis sessions focused on personal development.',quote:'Our hypnosis sessions support personal development.',sourceUrl:pages[0].url};data.targetAudience={value:'Adults interested in stress management.',quote:'We offer appointments for adults interested in stress management.',sourceUrl:pages[0].url};data.industry={value:'Health & Wellness',quote:'Our hypnosis sessions support personal development.',sourceUrl:pages[0].url};const result=verifiedProfile(data,pages);assert.equal(result.suggestions.industry,'Health & Wellness');assert.match(result.suggestions.description,/personal development/);assert.ok(result.missing.includes('visualRules'));});
test('fabricated evidence, other websites and unsupported guarantees do not fill profile fields',()=>{const data=draft();data.description={value:'A guaranteed cure.',quote:'Our hypnosis sessions support personal development.',sourceUrl:pages[0].url};data.targetAudience={value:'Children',quote:'We work with young children.',sourceUrl:pages[0].url};data.voice={value:'Bold',quote:pages[0].text,sourceUrl:'https://other-business.example/'};assert.equal(Object.keys(verifiedProfile(data,pages).suggestions).length,0);});
test('website addresses normalize to full HTTPS and reject unsafe schemes',()=>{assert.equal(normalizedWebsite('https:/master-mind.us'),'https://master-mind.us/');assert.equal(normalizedWebsite('master-mind.us'),'https://master-mind.us/');assert.throws(()=>normalizedWebsite('http://mind.example'));assert.throws(()=>normalizedWebsite('https://user:password@mind.example'));});
