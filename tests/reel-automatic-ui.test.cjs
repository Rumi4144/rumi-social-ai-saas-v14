const { test } = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), ts = require("typescript");
const industryModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/industries.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: industryModule, exports: industryModule.exports });
const moduleContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/reels/automatic.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: moduleContext, exports: moduleContext.exports, require: name => { if(name === "@/lib/industries") return industryModule.exports; throw new Error(name); } });
const { autoPlanMatches, automaticMusic, reelOperationIsCurrent } = moduleContext.exports;
test("automatic draft cannot cross business, campaign or post boundaries", () => {
  const context = { organizationId: "hypnosis", campaignId: "week", contentItemId: "calm" };
  const plan = { organizationId: "hypnosis", campaign: { id: "week" }, post: { id: "calm" } };
  assert.equal(autoPlanMatches(plan, context), true);
  for (const change of [{ organizationId: "guitars" }, { campaignId: "other-week" }, { contentItemId: "other-post" }]) assert.equal(autoPlanMatches(plan, { ...context, ...change }), false);
});
test("delayed planning, export and save completions cannot modify a switched selection", async () => {
  for (const operation of ["plan", "export", "save"]) {
    let current = "hypnosis:week:calm", applied = false;
    const started = current, controller = new AbortController();
    const pending = Promise.resolve().then(() => { if (reelOperationIsCurrent(started, current, controller.signal)) applied = true; });
    current = "guitars:launch:instrument";
    await pending; assert.equal(applied, false, operation);
  }
});
test("cancelled export stays cancelled even if its selected post is unchanged", async () => {
  const controller = new AbortController(); let applied = false;
  const pending = Promise.resolve().then(() => { if (reelOperationIsCurrent("org:campaign:post", "org:campaign:post", controller.signal)) applied = true; });
  controller.abort(); await pending; assert.equal(applied, false);
  assert.equal(reelOperationIsCurrent("org:campaign:post", "org:campaign:post", new AbortController().signal), true);
});
test("business-specific default uses a real guitar recording or calm nature track", () => {
  assert.equal(automaticMusic("Master Mind Hypnosis"), "ocean-waves");
  assert.equal(automaticMusic("Guitar Gallery"), "classical");
  assert.equal(automaticMusic("Other business"), "ambient");
});
