# Rumi Social AI deployment

The release checks and outstanding live acceptance evidence are maintained in
[COMMERCIAL_READINESS.md](COMMERCIAL_READINESS.md).

1. Configure the intended HTTPS app origin, PostgreSQL connection, distinct
   auth/encryption/worker/cron secrets, storage and enabled provider credentials.
   Public signup additionally requires Turnstile and verified-sender email
   delivery. Use `.env.example` for names; never deploy its placeholder values.
2. Run `npm ci`, `npm test` and `npm run production:check`.
3. On a **new empty database**, apply the committed baseline with
   `npm run db:deploy`. For an **existing production database**, first follow the
   backup, schema comparison and reviewed baseline-adoption procedure in the
   runbook. Do not blindly apply the baseline or use `db push` on production.
4. Run `npm run readiness:check -- --billing --signup` with the deployment's
   environment. This is read-only and does not print secret values.
5. Deploy to staging, verify the Vercel schedules execute with `CRON_SECRET`, and
   record real generation, recovery, billing, email and enabled-platform
   publication outcomes before a wider launch.
6. Verify production `/api/health`, monitoring alerts and restore readiness.

Building or deploying does not execute migrations automatically. Existing
`TOKEN_ENCRYPTION_KEY` values must not be rotated without a re-encryption or
provider-reconnection plan. TikTok Direct Post audit approval is external and
must be verified independently of account connection.
