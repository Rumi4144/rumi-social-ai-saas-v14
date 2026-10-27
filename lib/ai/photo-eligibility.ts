/** A saved candidate is not automatically reusable until it passes or is reviewed by a person. */
export function photoAllowsAutomaticUse(metadata: unknown): boolean {
  const review = (metadata as {photoReview?: {status?: string; issues?: string[]; userReviewed?: boolean}} | null)?.photoReview;
  return !review || (review.status === 'passed' && !review.issues?.length) || review.userReviewed === true;
}
