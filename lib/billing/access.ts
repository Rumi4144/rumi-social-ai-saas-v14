export function canManageBilling(role: string, isSuperAdmin = false) { return isSuperAdmin || role === "owner" || role === "admin" || role === "superadmin"; }
export function billingBaseUrl() {
  const value = process.env.NEXT_PUBLIC_APP_URL;
  if (!value) throw new Error("Billing return address is not configured.");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("Invalid billing return address.");
  return url.origin;
}
