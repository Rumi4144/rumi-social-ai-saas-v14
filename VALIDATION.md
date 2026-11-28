# Release validation

## Verified hardening baseline

Commit `20a4f6e` on PR #11 passed:

- Local Node regression suite: **706 passed**, one existing optional frame-render test skipped.
- Local TypeScript check and Next.js **15.5.29** production build.
- npm dependency audit: zero known vulnerabilities at the time of that audit.
- Full GitHub CI, including browser checks and real PostgreSQL credit-concurrency
  integration checks on the disposable CI database.

Evidence: [CI run 46102031240](https://github.com/Rumi4144/rumi-social-ai-saas-v14/actions/runs/46102031240).
The original local browser limitation was superseded by this passing CI run;
local PostgreSQL remained unavailable, so the database test result comes from CI.

## Additional release work awaiting final CI

The subsequent changes add public-signup email ownership verification, a committed
initial Prisma baseline, migration-based disposable-database initialization and
schema comparison in CI, and public-signup configuration preflight. The prior
baseline's green CI does **not** certify these later changes.

The five production-readiness regression tests, TypeScript check and Prisma
schema validation passed locally after the preflight/baseline updates. Final
combined unit, TypeScript, production build, browser and migration/real-database
CI results must be refreshed for the final commit including signup verification.

## Remaining external acceptance checks

A passing build or mocked provider test is not proof of production delivery.
Record live generation/recovery, actual provider publication, verification-email
delivery, billing webhooks, database backup/restore and deployment configuration
results before a wider launch. The existing live health response reported Stripe
configuration false; paid-service readiness is therefore not established.
TikTok Direct Post audit approval remains an external dependency.

See [COMMERCIAL_READINESS.md](COMMERCIAL_READINESS.md) for the read-only preflight,
existing-database baseline adoption safeguards and launch acceptance evidence.
No production migration, baseline adoption, purchase, token rotation or live
publishing mutation was performed by these validation commands.

## Combined signup/baseline validation

The final combined local suite passed 719 tests with one optional frame-render
skip. TypeScript and the Next.js production build passed with the new signup
verification routes. The committed baseline still requires its fresh CI
`migrate deploy` + schema comparison and browser run before merge.
