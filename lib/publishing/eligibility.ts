// Scheduling or delivering an approved post does not revoke its approval for other accounts.
export const approvedContentStatuses = ["approved", "scheduled", "published"];
export const reservedDeliveryStatuses = ["scheduled", "publishing", "retry", "processing", "verification_pending", "published"];

export type ExistingDelivery = { status: string; externalPostId: string | null };

export function deliveryMessage(status: string): string {
  if (status === "published") return "Already posted to this account.";
  if (status === "scheduled") return "Already scheduled for this account. Check recent publishing activity.";
  if (status === "verification_pending") return "Delivery needs review. Check recent publishing activity before trying again.";
  return "This post is already being prepared for this account. Check recent publishing activity.";
}

export function deliveryUrl(platform: string, id?: string | null): string | null {
  if (platform === "x" && /^\d+$/.test(id || "")) return `https://x.com/i/status/${id}`;
  if (platform === "youtube" && /^[A-Za-z0-9_-]+$/.test(id || "")) return `https://www.youtube.com/watch?v=${id}`;
  return null;
}
