# Commercial release validation

This repository has automated safeguards, but a passing build is not evidence
that a real account can generate, approve and publish a campaign. Do not label a
release commercially ready until the checks below have recorded outcomes.

## Repeatable checks

- `npm test`: unit and service regression suite; no production credentials needed.
- `npm run production:check`: Prisma schema/client validation, TypeScript and Next production build.
- `npm run readiness:check`: **read-only** production configuration and required database-table check.
- `npm run readiness:check -- --billing`: also require the four subscription price IDs and Stripe webhook credentials.
- `npm run readiness:check -- --signup`: also require public signup challenge keys and verification-email delivery configuration.
- `npm run release:check`: tests, build, paid-service and public-signup preflight together.

CI additionally applies the reviewed baseline migration to its disposable
PostgreSQL service, checks that the resulting schema matches Prisma, and runs
`tests/database-credit.integration.cjs` against it, checking real concurrent
credit grants, replayed purchases and overdraft prevention. To run that test
locally, explicitly supply `TEST_DATABASE_URL` for a disposable database; it
never falls back to production `DATABASE_URL`. It creates and removes one
uniquely named fixture workspace.

Run preflight from the deployed environment or a terminal with the intended
environment explicitly supplied. It deliberately does not load a local `.env`
file, print secret values, change configuration or apply schema changes. It
returns nonzero for missing configuration, database access failure or missing
tables. Provider authentication, webhook delivery, indexes/columns and data
integrity still need their own verification.

`/api/health` is a noncached readiness response: HTTP 200 only when core
configuration and every Prisma model's table are present; HTTP 503 otherwise.
It returns booleans, never database errors or secret values. Optional billing
and video-provider credentials are checked separately when enabling those
features. Configure monitoring to alert on 503, rather than merely checking
that an HTTP response exists.

## Production configuration

Core generation and scheduled publishing require distinct random values of at
least 32 characters for `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `WORKER_SECRET`
and `CRON_SECRET`, plus `DATABASE_URL`, an HTTPS origin in
`NEXT_PUBLIC_APP_URL`, `OPENAI_API_KEY` and `BLOB_READ_WRITE_TOKEN`. Placeholder
example values intentionally fail preflight. Do **not** rotate an existing
`TOKEN_ENCRYPTION_KEY` without a token re-encryption/reconnect plan.

Vercel must run the schedules in `vercel.json` and send
`Authorization: Bearer <CRON_SECRET>`. All configured cron endpoints require
this token. Confirm the hosting plan supports their minute-level schedules and
function execution limits. Verify actual recent successful runs for weekly
preparation, video polling and scheduled publishing; configuration alone does
not prove execution.

When enabling paid checkout, verify Stripe live/test mode matches the release,
price amounts match the in-app catalog, webhook signatures succeed, replayed
paid events grant credits once, and a real subscription cancellation preserves
saved content. Use Stripe test mode and a staging workspace before live charges.
Verify password-reset email delivery and signup abuse controls with the configured
email/Turnstile providers. New public signups receive a 30-minute verification link. A pending registration
uses the existing Job table; no user, workspace or trial credits are created
until an explicit same-origin confirmation POST claims that link atomically.
GET requests and mail scanners cannot consume it. Existing accounts retain
access. Resend delivery and a verified sender must be configured; otherwise new
signup fails closed. Turnstile remains a separate bot-protection requirement.

## Database initialization and recovery

The initial baseline is committed at
`prisma/migrations/20261128000000_initial_baseline/migration.sql`. It was
produced from the existing `prisma/schema.prisma` with Prisma's empty-to-schema
diff, then reviewed for tables, indexes and foreign keys. It represents the
existing schema, not a change to existing customer data. CI must apply it to an
empty disposable database and verify that the resulting schema matches Prisma.

For a **new empty database**, run `npm run db:deploy`, then the read-only
preflight before starting customer work. Commit any future schema change as an
explicit reviewed migration and test it on staging first.

For an **existing Neon production database**, do not blindly execute the initial
baseline or use `prisma db push` as a shortcut. First obtain and verify a
recoverable backup/Neon branch, then compare the actual application schema,
indexes and constraints against this baseline. Only after they match may an
operator mark `20261128000000_initial_baseline` as applied using Prisma's
baseline adoption procedure. Review any differences explicitly before adoption.
Without that reviewed adoption, `prisma migrate deploy` can refuse a nonempty
database with P3005; do not bypass this guard. No production baseline adoption,
resolve or migration has been performed by this change.

Test deployment and rollback/restore on staging. The readiness table check
detects an empty/partial restore, but does not replace the schema comparison,
baseline adoption review or restore drill.

## Launch acceptance evidence

Record build SHA, timestamp, workspace, expected behavior, actual outcome and
provider post ID/link for each item:

1. Independent brands cannot read/edit each other's content; signed-out routes
   show no customer workspace data; normal users cannot call admin recovery.
2. Generate complete seven-day campaigns for multiple workspaces concurrently;
   interrupt/retry workers and verify no missing content or duplicate charges.
3. Upload MP4, approve, schedule and publish on each enabled provider; confirm
   the public/private destination link and distinguish queued/processing from
   published. Fix failures before advertising that platform as available.
4. Confirm TikTok Content Posting API audit approval and permitted visibility;
   reconnecting an account is not approval or proof of a published post.
5. Exercise billing purchase/replay/failure, insufficient credits, cancellation,
   email recovery, monitoring alerts and database restore with recorded results.

External provider approvals, production configuration and live-account checks
cannot be certified by mocked tests. Keep their result status explicit.

## Hardening validation — 2026-11-27

The four-worker hardening change passed the local TypeScript check and full
Next.js 15.5.29 production build. The Node regression suite passed 706 tests,
with one existing optional frame-render test skipped. A fresh npm audit reported
zero known vulnerabilities after compatible dependency updates and reviewed
transitive overrides. Zod was upgraded to v4 and the campaign record schema was
adapted; Prisma/client remain aligned at 6.19.3.

Local browser suites could not launch: the available Chromium wrapper has no
browser binary, and the Playwright browser download was unavailable. Local
PostgreSQL is also unavailable. Subsequent GitHub CI for commit `20a4f6e`
passed both validation and the browser job, including the real disposable-DB
credit-concurrency test ([run 46102031240](https://github.com/Rumi4144/rumi-social-ai-saas-v14/actions/runs/46102031240)).
That CI used the original temporary `db push` setup. The new committed baseline
and signup additions require a fresh CI run using `migrate deploy` before release.
The no-credentials preflight correctly exits nonzero instead of certifying an
unconfigured deployment. No production migration, purchase or social post was
performed during this validation.

## Read-only production observations — 2026-11-27

The existing live health response reported database/auth/generation/encryption/
worker configuration present, but **Stripe configuration false**. This means the
live release has not passed paid-service preflight; code changes do not supply
the missing credentials. Its health response predates the stricter readiness
checks in this branch, so those booleans are not a current preflight pass.

Public signup reported protected mode, and the signed-out homepage displayed
sign-in/start-free navigation without a customer workspace sidebar. These are
useful read-only checks, not proof of all cross-workspace authorization paths.
No live publishing mutation, purchase, token rotation, migration or baseline
adoption was performed as part of these observations.

## First production rollout

PR #11 was merged as `65261fbb` and Vercel reported successful production
deployments. Read-only `/api/health` returned HTTP 200 with all core
configuration, database and schema checks true. The explicitly approved empty
request to `/api/publishing/retry` returned HTTP 401 UNAUTHENTICATED; it did not
create or retry a social post. The public signed-out homepage showed only public
navigation. The subsequent email-verification and migration-baseline changes
require their own green CI and deployment verification.
