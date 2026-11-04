const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, deps = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, {
    module, exports: module.exports,
    require: name => name in deps ? deps[name] : require(name),
    process,
  });
  return module.exports;
}

function route({ role = "admin", product = { id: "guitar", name: "Concert Guitar", description: "Handmade in New York", price: null, currency: "USD", brand: { name: "Rumi Guitars", voice: "Warm and refined", industry: "Musical instruments" } }, output = { headline: "Find your own sound", subheadline: "A thoughtful companion for your next song.", cta: "Explore guitars" } } = {}) {
  let query, prompt, schema, calls = 0;
  class OpenAI {
    responses = { create: async input => { calls++; prompt = input.input; schema = input.text.format.schema; return { output_text: JSON.stringify(output) }; } };
  }
  const api = load("app/api/creative/generate-copy/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ status: options.status || 200, body, headers: options.headers }) } },
    openai: OpenAI,
    "@/lib/auth/context": { tenantContext: async () => ({ organizationId: "workspace-1", role, isSuperAdmin: true }) },
    "@/lib/prisma": { prisma: { product: { findFirst: async input => { query = input; return product; } } } },
  });
  return { api, query: () => query, prompt: () => prompt, schema: () => schema, calls: () => calls };
}

const request = body => ({ json: async () => body });

test("generates concise, factual ad copy from the selected workspace product and brand", async () => {
  const before = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const app = route();
    const response = await app.api.POST(request({ productId: "guitar" }));
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(JSON.stringify(response.body)), {
      headline: "Find your own sound",
      subheadline: "A thoughtful companion for your next song.",
      cta: "Explore guitars",
    });
    assert.equal(app.query().where.id, "guitar");
    assert.equal(app.query().where.brand.organizationId, "workspace-1");
    assert.match(app.prompt(), /Handmade in New York/);
    assert.match(app.prompt(), /Do not invent specifications/);
    assert.equal(app.schema().additionalProperties, false);
  } finally {
    if (before === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = before;
  }
});

test("does not generate copy for viewers or incomplete responses", async () => {
  const before = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const viewer = route({ role: "viewer" });
    assert.equal((await viewer.api.POST(request({ productId: "guitar" }))).status, 403);
    assert.equal(viewer.calls(), 0);

    const incomplete = route({ output: { headline: "", subheadline: "A line", cta: "Explore" } });
    assert.equal((await incomplete.api.POST(request({ productId: "guitar" }))).status, 500);
  } finally {
    if (before === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = before;
  }
});

test("returns not found when the product is outside the selected workspace", async () => {
  const before = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const app = route({ product: null });
    assert.equal((await app.api.POST(request({ productId: "foreign-product" }))).status, 404);
    assert.equal(app.calls(), 0);
  } finally {
    if (before === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = before;
  }
});
