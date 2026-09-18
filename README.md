# Rumi Social AI SaaS V14

Standalone multi-tenant foundation for a monetizable AI social-media campaign platform.

## Included
- Premium Next.js dashboard and Create Everything workflow
- Campaign calendar, Brand Brain and subscription/credit screens
- PostgreSQL/Prisma multi-tenant schema: users, organizations, memberships, brands, products, campaigns, content items, subscriptions and usage
- API health route and typed campaign job endpoint
- Credit-cost foundation
- Environment placeholders for OpenAI, Runway and Stripe

## Production architecture
Next.js UI/API -> PostgreSQL -> background queue/workers -> AI providers -> object storage/CDN -> social publishing APIs.

## Important
V1 is a deployable application foundation, not yet a production billing/publishing service. Before charging customers, add authentication, Stripe Checkout/webhooks, queue workers, provider retry/idempotency, object storage, official social OAuth flows, privacy/terms, rate limits, observability and security review.

## Run locally
1. Copy `.env.example` to `.env`
2. Set `DATABASE_URL`
3. `npm install`
4. `npx prisma generate`
5. `npx prisma migrate dev`
6. `npm run dev`

## V2
Commercial UX upgrade: onboarding, Creative Library, analytics intelligence, business connections, Stripe Checkout foundation, credit API, social connection/job/credit-ledger models, and Auth.js dependencies.

## V3 — Functional SaaS Core
- Transactional account + organization + trial-credit registration endpoint
- Persistent Brand Brain update endpoint
- Real Create Everything campaign queue endpoint
- Atomic credit spending with immutable credit-ledger entries
- Background Job persistence and status API
- Stripe webhook signature verification and subscription-state synchronization
- Interactive Create Everything page connected to the campaign API
- Production direction: add Auth.js session authorization to every tenant route before public launch; queue worker executes AI/media jobs asynchronously.

## V4 — AI Production Engine
- Real OpenAI Responses API campaign generation
- Strict JSON-schema campaign output
- Default cost-sensitive text model: gpt-5.6-luna (environment configurable)
- Brand Brain injected into generation
- Grounding guardrails against invented specs, awards, reviews, scarcity and unsupported claims
- Worker endpoint claims queued Create Everything jobs and persists generated content
- Generates campaign strategy package, social posts, Stories, carousel plan and Reel/voiceover/scene plan
- Campaign review page with approval/edit/regenerate UX foundation
- Worker secret protects background execution endpoint

For production, invoke `/api/jobs/run` from a trusted queue/worker scheduler with `x-worker-secret`; do not expose the worker secret to browsers.

## V5 — Visual + Video Production
- Creative Studio workspace and format preview
- Server-side SVG social creative renderer for square, portrait and Story/Reel formats
- Persistent MediaAsset records for generated creatives
- Render API returning portable SVG data assets
- Video-generation job queue with credit enforcement
- Runway image-to-video provider adapter using configurable model
- 5-second/10-second video credit pricing
- Creative Studio navigation and premium editorial UI

Production note: replace data-URL asset persistence with S3/R2 object storage + CDN before scale. Video jobs should be executed by a trusted worker and generated provider outputs copied immediately to owned storage.

## V6 — Publishing Center
- Multi-channel Publishing Center UX
- Schedule API for one content item to one or many connected accounts
- Per-platform/per-connection idempotency keys to reduce duplicate publishing during retries
- Persistent PublishJob and PublishAttempt audit records
- Worker-safe due-post queue with four-attempt retry ceiling
- Retry endpoint and per-platform status
- Provider adapter boundary for official Meta/LinkedIn/etc. OAuth and publishing implementations
- Tokens remain server-side in the architecture

Important: provider publishing is deliberately adapter-only in this build. Official OAuth and current platform publishing APIs must be implemented and verified per provider before public launch; V6 does not falsely simulate successful social posting.

## V7 — Security + Multi-user Foundation
- AES-256-GCM encryption/decryption helper for social-provider secrets
- Tenant membership and role enforcement foundation
- Owner/Admin/Editor/Member/Viewer role model
- Persistent audit log with hashed IP support
- Database-backed rate-limit buckets
- Team invitation model
- Team & Access workspace UX
- Internal SaaS Admin operations dashboard
- Publishing adapter now decrypts provider credentials server-side
- Admin audit endpoint protected by a separate server secret
- Environment secrets for token encryption, authentication and internal administration

Security note: before public launch, session-derived user/organization identity must replace any browser-supplied tenant IDs on protected API routes. V7 provides the enforcement primitives, but a full Auth.js session integration is still required.

## V8 — Authenticated Tenant Core
- Auth.js / NextAuth credentials authentication wired to Prisma users
- bcrypt password hashing (cost 12) during registration
- JWT-backed sessions and custom login UI
- Protected application routes through Auth.js middleware
- Server-side current-user and tenant-context helpers
- Workspace membership derived from authenticated session
- Workspace switcher foundation for agency/multi-brand accounts
- Create Everything now verifies the selected Brand belongs to the authenticated tenant
- Publishing scheduling derives organization identity from the authenticated membership instead of trusting arbitrary browser tenant IDs

Production hardening still recommended: email verification, password reset, MFA/passkeys, CSRF review, session revocation, invite acceptance flow, and moving every remaining organization-scoped API to tenantContext().

## V9 — Agency Mode + Client Approval Portals
- Agency Command Center UI for multi-client operations
- Explicit agency-to-client workspace relationship model
- White-label agency name/logo/accent configuration fields
- Cryptographically random campaign approval links stored only as SHA-256 token hashes
- Expiring approval links with comment/edit permissions
- Approval decisions and client feedback audit records
- Campaign status transitions for approved / changes requested
- Public client approval portal foundation
- Agency client-link API restricted to Owner/Admin membership

Important: the approval portal's form is a UX foundation; the response API expects JSON, so production wiring should submit it with a server action/client fetch. Email delivery of approval links and branded custom domains are also future work.

## V10 — Monetization Engine
- Central plan entitlement definitions for Starter, Creator, Business and Agency
- Monthly AI-credit grants triggered from paid invoice webhooks
- Idempotent Stripe webhook event ledger
- One-time credit top-up Checkout sessions
- Customer Billing Portal session endpoint
- Authenticated usage/credit-ledger API
- Authenticated entitlement API
- Usage & Credits dashboard
- CreditGrant records for subscription/top-up accounting
- Plan limits for brands, team seats, client workspaces, social accounts and scheduled posts
- White-label entitlement reserved for Agency tier

Pricing and Stripe Price IDs remain configuration, not hardcoded commercial truth. Validate final prices, tax handling, refunds, trials, and Stripe configuration before charging customers.

## V11 — Launch Journey Pass
- Public conversion landing page
- Real signup UI wired to account/workspace registration
- 100-credit trial messaging
- Four-step guided onboarding
- Persistent OnboardingState
- Brand creation + Brand Brain seed during onboarding
- Authenticated dashboard metrics from Prisma instead of demo KPI numbers
- First-campaign empty state and guided CTA
- Authenticated trial-status and dashboard APIs
- Customer journey now maps: landing → signup → login → guided setup → Brand Brain → Create Everything → approval → publishing → billing

Still required before a public paid launch: wire the onboarding UI's final step to `/api/onboarding/complete`, add email verification/reset, configure real Stripe Price IDs/tax policy, implement provider OAuth/publishing adapters, run migrations/build/tests against a deployed PostgreSQL instance, and complete privacy/terms/support/observability.

## V12 — Production Readiness Pass
- Onboarding final step is now wired to the authenticated completion API
- Global loading, error and not-found experiences
- Database-aware health/readiness endpoint
- Security response headers and removed Next.js powered-by header
- Production environment placeholders
- Prisma validation/generation, TypeScript check and migration deployment scripts
- Deployment checklist covering database, secrets, workers, storage, billing, OAuth, email, monitoring, backups, policies and security testing
- Version 12.0.0

V12 is a production-readiness foundation, not a claim that the app has passed a real deployment build. The package itself is validated here; dependency installation, Prisma validation, migrations, TypeScript/build tests and end-to-end tests must be run in the target deployment environment.

## V13 — Deployment & Validation Gate
- Production-check script: Prisma validate → Prisma generate → TypeScript → Next.js build
- GitHub Actions CI with PostgreSQL 16
- Docker production build foundation
- Vercel no-store API configuration
- System Readiness / Launch Control page
- Central API error normalization helper
- Docker ignore and deployment hygiene
- Current default OpenAI text model remains `gpt-5.6-luna`, matching the official model catalog at build time.

This artifact has ZIP/file validation only in this environment. The CI workflow is designed to perform the real dependency-backed Prisma, TypeScript and Next.js build checks after the repository is installed/pushed.

## V14 — First Real Validation Attempt
- Attempted an actual dependency-backed validation run.
- Dependency installation exceeded the available execution window and remained incomplete.
- Added `VALIDATION.md` with the exact validation status and authoritative next commands.
- No speculative product features were added in this release.
