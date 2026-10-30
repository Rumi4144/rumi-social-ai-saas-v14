import { createHash } from "node:crypto";
type RecoveryJob = { organizationId: string; id: string; type: string; status: string; attempts: number; payload: unknown; result: unknown };
const object = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
export function providerImageJobId(organizationId: string, imageJobId: string) { return `image-provider-${createHash("sha256").update(JSON.stringify([organizationId, `worker:${imageJobId}`])).digest("hex").slice(0, 40)}`; }
/** A retry may reuse purchased results or re-fetch an original website photo.
 * Unknown/failed provider submissions are never turned into new purchases. */
export function weeklyRetryReason(job: RecoveryJob, providerTask?: { organizationId: string; status: string; result: unknown } | null) {
  if (job.status !== "failed") return "Only a failed preparation step can be retried here.";
  if (job.attempts >= 3) return "This step has reached its retry limit. Review the source or request a corrected design.";
  if (job.type === "CREATE_EVERYTHING") return object(job.result).generatedPack ? null : "There is no saved copy response to resume. Review this failure before starting any new model request.";
  if (job.type !== "GENERATE_IMAGE") return "This is not a weekly preparation step.";
  if (typeof object(job.payload).sourceImageUrl === "string" && object(job.payload).sourceImageUrl) return null;
  const saved = object(providerTask?.result);
  if (providerTask?.organizationId === job.organizationId && providerTask.status === "succeeded" && (saved.base64 || saved.url)) return null;
  return "The image provider has not confirmed a reusable result. No second image will be purchased by retrying.";
}
