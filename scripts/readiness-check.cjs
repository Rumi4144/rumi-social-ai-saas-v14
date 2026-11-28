#!/usr/bin/env node
// Read-only production preflight. Run with deployment environment variables;
// this deliberately does not load or print secrets from local .env files.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const moduleState = { exports: {} };
const source = fs.readFileSync(path.join(__dirname, '../lib/operations/readiness.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: moduleState, exports: moduleState.exports, URL, Set });
const { configurationChecks, missingTables } = moduleState.exports;
async function main() {
  const checks = configurationChecks(process.env, process.argv.includes('--billing'), process.argv.includes('--signup'));
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length) {
    console.error('Production configuration needs attention: ' + failed.join(', '));
    process.exitCode = 1;
    return;
  }
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe('SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = current_schema()');
    const missing = missingTables(rows);
    if (missing.length) {
      console.error('Database schema is incomplete. Missing tables: ' + missing.join(', '));
      process.exitCode = 1;
    } else console.log('Production configuration and required database tables passed. Provider access, billing delivery and live publishing still require staging tests.');
  } catch {
    console.error('Could not verify the production database. Check connectivity and database permissions; no changes were made.');
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error('Production preflight failed; no configuration values are printed.'); process.exitCode = 1; });
