# Rumi Social AI V12 — Deployment Checklist
1. Provision PostgreSQL and set DATABASE_URL.
2. Generate strong AUTH_SECRET, WORKER_SECRET, ADMIN_SECRET and TOKEN_ENCRYPTION_KEY.
3. Configure NEXT_PUBLIC_APP_URL to the production HTTPS origin.
4. Configure OpenAI, Stripe and Runway keys only on the server.
5. Configure trusted Stripe Price IDs and webhook endpoint.
6. Run `npm install`, `npx prisma generate`, `npx prisma migrate deploy`, `npm run build`.
7. Create a trusted background worker/cron for AI, video and publishing queues.
8. Replace SVG data URLs with S3/R2-compatible object storage before meaningful scale.
9. Implement and review official social-provider OAuth/publishing adapters before enabling Publish.
10. Add transactional email for verification, password reset, invitations and approval links.
11. Add error monitoring, structured logs, uptime checks and backups.
12. Complete Terms, Privacy, acceptable-use, deletion/export, tax and support policies.
13. Run tenant-isolation, billing-webhook, retry/idempotency and provider-token security tests.
14. Keep /api/health behind operational monitoring if infrastructure detail is considered sensitive.
