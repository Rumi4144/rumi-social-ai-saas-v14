# Commercial release validation

This repository has automated safeguards, but a passing build is not evidence
that a real account can generate, approve and publish a campaign. Do not label a
release commercially ready until the checks below have recorded outcomes.

## Repeatable checks

- `npm test`: unit and service regression suite; no production credentials needed.
- `npm run production:check`: Prisma schema/client validation, TypeScript and Next production build.
- `npm run readiness:check`: **read-only** production configuration and required database-table check.
- `npm run readiness:check -- --billing`: also require the four subscription price IDs and Stripe webhook credentials.
- `npm run release:check`: the preceding tests, build and paid-service preflight together.

CI additionally initializes its disposable PostgreSQL service and runs
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
email/Turnstile providers. Account email verification remains a separate release
requirement; Turnstile does not verify ownership of an email address.

## Database initialization and recovery

There is currently **no committed Prisma migration history**. Consequently,
`npm run db:deploy` (`prisma migrate deploy`) alone cannot initialize an empty
database. Do not interpret its success as proof that tables exist, and do not
use `prisma db push` against the existing Neon production database as a release
shortcut.

Before introducing migrations, obtain and verify a recoverable Neon backup or
branch, compare the real schema with `prisma/schema.prisma`, and create/review a
baseline migration in source control. Apply it to a new disposable database and
run the application regression suite. For an existing database, mark a baseline
as applied only after proving its schema already matches; review any differences
as explicit migrations. Then test deployment and rollback/restore on staging.
The readiness table check detects an empty/partial restore, but it does not
replace that schema comparison or a restore drill.

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
PostgreSQL is also unavailable; the real credit-concurrency integration test is
configured for the disposable CI database and has not been claimed as passed.
The no-credentials preflight correctly exits nonzero instead of certifying an
unconfigured deployment. No production migration, purchase or social post was
performed during this validation.
