const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const moduleFixture={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/presenter/speech-text.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:moduleFixture,exports:moduleFixture.exports,URL});
const {presenterSpeechText}=moduleFixture.exports;
test('imported scripts speak the website without protocol, paths or tracking parameters',()=>{
 assert.equal(presenterSpeechText('Visit https://master-mind.us/service/stress?ref=ad.'),'Visit master mind dot U S.');
 assert.equal(presenterSpeechText('See https://www.rumiguitars.com/products/acoustic#details!'),'See Rumi Guitars dot com!');
 assert.equal(presenterSpeechText('Book at master-mind.us/consultation. Find us at www.example.org.'),'Book at master mind dot U S. Find us at example dot org.');
 assert.equal(presenterSpeechText('Visit [our website](https://master-mind.us/book).'),'Visit master mind dot U S.');
});
test('imported scripts normalize the known inch example and avoid caption hashtags',()=>{
 assert.equal(presenterSpeechText('Meet our 41-inch guitar. #RumiGuitars'),'Meet our forty-one inch guitar.');
 assert.equal(presenterSpeechText('Meet our forty-one inch guitar.'),'Meet our forty-one inch guitar.');
});
test('normalization is idempotent and bounds imported copy at a word boundary',()=>{
 const script=presenterSpeechText('Visit https://master-mind.us.');assert.equal(presenterSpeechText(script),script);
 const bounded=presenterSpeechText('A natural guitar. '.repeat(50));assert.ok(bounded.length<=600);assert.ok(!bounded.endsWith('guit'));
});
