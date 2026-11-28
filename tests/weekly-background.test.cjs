const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/weekly-load.cjs");

test("twenty simultaneous weekly packs drain in bounded batches without browser requests", async () => {
  const jobs = Array.from({ length: 20 }, (_, index) => ({
    id: `plan-${index}`, organizationId: `org-${index}`, status: "queued",
  }));
  let active = 0;
  let peak = 0;
  const run = new Map();
  process.env.CRON_SECRET = "test-cron";
  process.env.WORKER_SECRET = "test-worker";

  const { GET } = load("app/api/cron/weekly/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/prisma": { prisma: { job: {
      updateMany: async () => ({ count: 0 }),
      findMany: async ({ take, distinct, where }) => {
        if (where.status === "failed") return [];
        assert.equal(distinct[0], "organizationId");
        const tenants = new Set();
        return jobs.filter(job => {
          if (job.status !== "queued" || tenants.has(job.organizationId)) return false;
          tenants.add(job.organizationId);
          return true;
        }).slice(0, take);
      },
    } } },
    "@/app/api/jobs/run/route": { POST: async request => {
      assert.equal(request.headers.get("x-worker-secret"), "test-worker");
      const { jobId, organizationId, exact } = await request.json();
      assert.equal(exact, true);
      const job = jobs.find(row => row.id === jobId);
      assert.equal(job.organizationId, organizationId);
      assert.equal(job.status, "queued");
      job.status = "running";
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setImmediate(resolve));
      run.set(jobId, (run.get(jobId) || 0) + 1);
      if (jobId === "image-3-0" && run.get(jobId) === 1) {
        job.status = "queued";
      } else {
        job.status = "succeeded";
        if (jobId.startsWith("plan-")) {
          for (let day = 0; day < 7; day++) {
            jobs.push({ id: `image-${jobId.slice(5)}-${day}`, organizationId, status: "queued" });
          }
        }
      }
      active--;
      return Response.json({ status: job.status });
    } },
  });
  const url = "https://test.example/api/cron/weekly";
  assert.equal((await GET(new Request(url))).status, 401);
  let batches = 0;
  while (jobs.some(job => job.status === "queued")) {
    assert.ok(batches++ < 60);
    const response = await GET(new Request(url, { headers: { authorization: "Bearer test-cron" } }));
    const result = await response.json();
    assert.ok(result.attempted > 0 && result.attempted <= 4);
    assert.equal(result.errors, 0);
  }
  assert.equal(jobs.length, 160);
  assert.ok(jobs.every(job => job.status === "succeeded"));
  assert.equal(peak, 4);
  assert.equal([...run.values()].reduce((sum, count) => sum + count, 0), 161);
});

test("interrupted weekly steps resume only durable tenant-owned results within the retry budget", async () => {
  const { providerImageJobId } = load("lib/weekly/recovery.ts");
  const old = new Date(Date.now() - 900_000);
  const step = (id, extra = {}) => ({ id, organizationId: "org-a", type: "GENERATE_IMAGE", status: "running", attempts: 1,
    payload: { weeklyPackId: "pack-a" }, result: null, updatedAt: old, ...extra });
  const jobs = [step("saved-image"), step("unknown-image"), step("foreign-image"), step("rejected-image"),
    step("exhausted", { attempts: 3 }), step("website", { payload: { weeklyPackId: "pack-a", sourceImageUrl: "https://brand.test/a.jpg" } }),
    step("copy", { type: "CREATE_EVERYTHING", result: { generatedPack: { title: "Saved copy" } } }),
    step("unknown-copy", { type: "CREATE_EVERYTHING" }), step("not-weekly", { payload: {} })];
  const provider = (id, extra = {}) => ({ id: providerImageJobId("org-a", id), organizationId: "org-a", type: "IMAGE_PROVIDER_TASK", status: "succeeded", result: { base64: "purchased-bytes" }, ...extra });
  const providers = [provider("saved-image"), provider("unknown-image", { status: "submitting", result: {} }),
    provider("foreign-image", { organizationId: "org-b" }), provider("rejected-image", { status: "failed" }), provider("exhausted")];
  const matches = (job, where) => (!where.id || job.id === where.id) && (!where.organizationId || job.organizationId === where.organizationId)
    && job.status === where.status && (!where.payload || typeof job.payload.weeklyPackId === "string")
    && (where.attempts === undefined || (typeof where.attempts === "number" ? job.attempts === where.attempts : job.attempts < where.attempts.lt))
    && (!where.updatedAt || (where.updatedAt.lt ? job.updatedAt < where.updatedAt.lt : job.updatedAt === where.updatedAt));
  const prisma = { job: {
    updateMany: async ({ where, data }) => { const rows = jobs.filter(job => matches(job, where)); for (const row of rows) Object.assign(row, data, { updatedAt: new Date() }); return { count: rows.length }; },
    findMany: async ({ where, take }) => {
      if (where.type === "IMAGE_PROVIDER_TASK") return providers.filter(row => where.id.in.includes(row.id));
      // Recently resumed work waits for the normal backoff before execution.
      if (where.status === "queued") return [];
      return jobs.filter(job => matches(job, where)).slice(0, take);
    },
  } };
  const { GET } = load("app/api/cron/weekly/route.ts", {
    "next/server": { NextResponse: Response }, "@/lib/prisma": { prisma },
    "@/app/api/jobs/run/route": { POST: () => { throw new Error("Backoff must apply to recovered work"); } },
  });
  process.env.CRON_SECRET = "test-cron"; process.env.WORKER_SECRET = "test-worker";
  const response = await GET(new Request("https://test.example/api/cron/weekly", { headers: { authorization: "Bearer test-cron" } }));
  const result = await response.json();
  assert.equal(result.expired, 8); assert.equal(result.resumed, 3);
  assert.deepEqual(jobs.filter(job => job.status === "queued").map(job => job.id), ["saved-image", "website", "copy"]);
  assert.equal(jobs.find(job => job.id === "not-weekly").status, "running");
  assert.ok(jobs.filter(job => job.status === "failed").every(job => job.progress === 100));
  const second = await (await GET(new Request("https://test.example/api/cron/weekly", { headers: { authorization: "Bearer test-cron" } }))).json();
  assert.equal(second.resumed, 0, "Concurrent/repeated cron passes must not resume an already claimed step twice");
});

test("ambiguous provider failures do not starve later recoverable work in the bounded scan", async () => {
  const old = new Date(Date.now() - 900_000);
  const jobs = Array.from({ length: 21 }, (_, index) => ({ id: `step-${String(index).padStart(2, '0')}`, organizationId: 'org',
    type: 'CREATE_EVERYTHING', status: 'failed', attempts: 1, updatedAt: old, payload: { weeklyPackId: 'pack' },
    result: index === 20 ? { generatedPack: { title: 'Already purchased copy' } } : null }));
  const prisma = { job: {
    updateMany: async ({ where, data }) => {
      const selected = jobs.filter(job => job.status === where.status && (!where.id || job.id === where.id)
        && (!where.updatedAt || (where.updatedAt.lt ? job.updatedAt < where.updatedAt.lt : job.updatedAt === where.updatedAt)));
      for (const job of selected) Object.assign(job, data, { updatedAt: new Date() });
      return { count: selected.length };
    },
    findMany: async ({ where, take }) => where.status === 'failed'
      ? jobs.filter(job => job.status === 'failed').sort((a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id)).slice(0, take)
      : [],
  } };
  const { GET } = load('app/api/cron/weekly/route.ts', { 'next/server': { NextResponse: Response },
    '@/lib/prisma': { prisma }, '@/app/api/jobs/run/route': { POST: () => { throw Error('Only recovery is expected'); } } });
  process.env.CRON_SECRET = 'test-cron'; process.env.WORKER_SECRET = 'test-worker';
  const request = () => new Request('https://test.example/api/cron/weekly', { headers: { authorization: 'Bearer test-cron' } });
  assert.equal((await (await GET(request())).json()).resumed, 0);
  assert.equal((await (await GET(request())).json()).resumed, 1);
  assert.equal(jobs.find(job => job.id === 'step-20').status, 'queued');
});
