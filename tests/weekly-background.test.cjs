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
      findMany: async ({ take, distinct }) => {
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
