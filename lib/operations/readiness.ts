export type ReadinessEnvironment = Record<string, string | undefined>;
export const REQUIRED_TABLES = [
  "User", "Organization", "Membership", "Brand", "Campaign", "ContentItem",
  "Product", "Subscription", "UsageEvent", "SocialConnection", "Job", "CreditLedger", "MediaAsset",
  "PublishJob", "PublishAttempt", "AuditLog", "ApiRateBucket", "CreditGrant",
  "BillingEvent", "OnboardingState", "PasswordResetToken", "Invitation",
  "ClientWorkspace", "ApprovalShare", "ApprovalDecision",
] as const;

const secretNames = ["AUTH_SECRET", "TOKEN_ENCRYPTION_KEY", "WORKER_SECRET", "CRON_SECRET"] as const;
const placeholder = /change[-_ ]?me|replace[-_ ]?with|not[-_ ]?for[-_ ]?production|your[-_ ]?(secret|key)/i;
export function configurationChecks(env: ReadinessEnvironment, billing = false) {
  const checks: Record<string, boolean> = {};
  for (const name of secretNames) {
    const value = env[name]?.trim() || "";
    checks[name] = value.length >= 32 && !placeholder.test(value);
  }
  // Reusing the worker or cron token as an auth/encryption key broadens a leak.
  checks.DISTINCT_SECRETS = new Set(secretNames.map(name => env[name])).size === secretNames.length;
  try {
    const url = new URL(env.NEXT_PUBLIC_APP_URL || "");
    checks.NEXT_PUBLIC_APP_URL = url.protocol === "https:" && !url.username && !url.password &&
      !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) && url.pathname === "/" && !url.search && !url.hash;
  } catch { checks.NEXT_PUBLIC_APP_URL = false; }
  try {
    const url = new URL(env.DATABASE_URL || "");
    checks.DATABASE_URL = ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname && url.pathname.length > 1);
  } catch { checks.DATABASE_URL = false; }
  for (const name of ["OPENAI_API_KEY", "BLOB_READ_WRITE_TOKEN"]) checks[name] = Boolean(env[name]?.trim()) && !placeholder.test(env[name]!);
  if (billing) {
    for (const name of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_STARTER_PRICE_ID", "STRIPE_CREATOR_PRICE_ID", "STRIPE_BUSINESS_PRICE_ID", "STRIPE_AGENCY_PRICE_ID"])
      checks[name] = Boolean(env[name]?.trim()) && !placeholder.test(env[name]!);
  }
  return checks;
}

export function missingTables(rows: Array<{ tablename: string }>) {
  const present = new Set(rows.map(row => row.tablename));
  return REQUIRED_TABLES.filter(table => !present.has(table));
}

export function readinessResult(checks: Record<string, boolean>, database: boolean, schema: boolean) {
  const all = { ...checks, database, schema };
  return { ready: Object.values(all).every(Boolean), checks: all };
}
