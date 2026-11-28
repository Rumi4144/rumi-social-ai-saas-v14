const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const { createHash } = require('node:crypto');
const PASSWORD_HASH = '$2b$12$' + 'a'.repeat(53);

function fixture(options = {}) {
  let state = { jobs: new Map(), users: new Map(), organizations: [], brands: [], memberships: [], subscriptions: [] };
  let tail = Promise.resolve();
  const sent = [], limits = new Map();
  const env = { RESEND_API_KEY: 'mock-key', RESEND_FROM_EMAIL: 'Rumi <verify@rumisocialai.com>', NEXT_PUBLIC_APP_URL: 'https://rumisocialai.com', ...options.env };
  let failDelivery = options.failDelivery, failTransaction = options.failTransaction, failLimits = options.failLimits;
  const matches = (value, where) => Object.entries(where).every(([key, condition]) => {
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('in' in condition) return condition.in.includes(value[key]);
      if ('lte' in condition) return value[key] <= condition.lte;
      if ('gt' in condition) return value[key] > condition.gt;
    }
    return value[key] === condition;
  });
  const models = current => ({
    job: {
      findMany: async query => [...current().jobs.values()].filter(job => matches(job, query.where)).slice(0, query.take || 100),
      findUnique: async query => current().jobs.get(query.where.id) || null,
      create: async query => { const job = { ...query.data, createdAt: new Date(), updatedAt: new Date() }; current().jobs.set(job.id, job); return job; },
      updateMany: async query => { let count = 0; for (const job of current().jobs.values()) if (matches(job, query.where)) { Object.assign(job, query.data); count++; } return { count }; },
      deleteMany: async query => { let count = 0; for (const job of current().jobs.values()) if (matches(job, query.where)) { current().jobs.delete(job.id); count++; } return { count }; },
      update: async query => { const job = current().jobs.get(query.where.id); if (!job) throw Error('missing'); Object.assign(job, query.data); return job; },
    },
    user: {
      findUnique: async query => current().users.get(query.where.email) || null,
      create: async query => { if (current().users.has(query.data.email)) { const error = Error('duplicate'); error.code = 'P2002'; throw error; } const user = { id: `user-${current().users.size}`, ...query.data }; current().users.set(user.email, user); return user; },
    },
    organization: { create: async query => { const value = { id: `org-${current().organizations.length}`, ...query.data }; current().organizations.push(value); return value; } },
    brand: { create: async query => { current().brands.push(query.data); return query.data; } },
    membership: { create: async query => { if (failTransaction) throw Error('transaction failure'); current().memberships.push(query.data); return query.data; } },
    subscription: { create: async query => { current().subscriptions.push(query.data); return query.data; } },
  });
  const prisma = { ...models(() => state), $transaction: async fn => {
    const previous = tail; let release; tail = new Promise(resolve => { release = resolve; }); await previous;
    const snapshot = structuredClone(state);
    try { const result = await fn(models(() => snapshot)); state = snapshot; return result; }
    finally { release(); }
  } };
  function load(file, extra = {}) {
    const cache = new Map();
    const mocks = {
      'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200, headers: new Headers(init.headers) }) } },
      '@/lib/prisma': { prisma },
      '@/lib/auth/password-reset': { resetSender: () => (env.RESEND_FROM_EMAIL || env.EMAIL_FROM || env.MAIL_FROM || '').trim() },
      '@/lib/security/rate-limit': { rateLimit: async (key, maximum) => { if (failLimits) return { ok: false, remaining: 0 }; const count = (limits.get(key) || 0) + 1; limits.set(key, count); return { ok: count <= maximum, remaining: Math.max(0, maximum - count) }; } },
      '@/lib/turnstile': { signupProtection: () => ({ mode: 'local' }), verifySignupChallenge: async () => true },
      bcryptjs: { hash: async () => PASSWORD_HASH },
      ...extra,
    };
    function compile(relative) {
      const filename = path.resolve(root, relative);
      if (cache.has(filename)) return cache.get(filename).exports;
      const module = { exports: {} }; cache.set(filename, module);
      vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
      }).outputText, { module, exports: module.exports, process: { env }, Buffer, URL, Date, Error, AbortSignal, console,
        fetch: async (_url, init) => { sent.push(JSON.parse(init.body)); if (failDelivery === 'throw') throw Error('delivery down'); return { ok: !failDelivery }; },
        require: name => name in mocks ? mocks[name] : name.startsWith('@/') ? compile(name.slice(2) + '.ts') : require(name),
      }, { filename });
      return module.exports;
    }
    return compile(file);
  }
  return { load, sent, limits, env, state: () => state, failDelivery: value => { failDelivery = value; }, failTransaction: value => { failTransaction = value; },
    token: (index = sent.length - 1) => sent[index].text.match(/token=([a-f0-9]{64})/)[1],
    pendingId: token => 'verify_signup_' + createHash('sha256').update(token).digest('hex'), PASSWORD_HASH,
  };
}
const input = { email: 'new@example.com', name: 'New Customer', password: 'valid-password', organization: 'New Business', industry: 'Health & Wellness' };
const request = (extra = {}, path = '/api/auth/register', origin = 'https://rumisocialai.com') => new Request(`https://rumisocialai.com${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(path.includes('verify-email') ? extra : { ...input, ...extra }) });
module.exports = { fixture, input, request };
