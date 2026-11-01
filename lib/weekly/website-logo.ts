import { prisma } from "@/lib/prisma";
import { readWebsiteLogo } from "@/lib/onboarding/website";

/** Backfill older businesses during preparation. The bounded public-site
 * reader only accepts actual logo evidence; no image model is involved. */
export async function importWeeklyLogo(organizationId: string, brand: { id: string; logoUrl: string | null; websiteUrl: string | null }) {
  if (brand.logoUrl || !brand.websiteUrl) return brand.logoUrl;
  let logo: string | undefined;
  try { logo = await readWebsiteLogo(brand.websiteUrl); } catch { return null; }
  if (!logo) return null;
  // Never overwrite a logo uploaded while the website request was running,
  // or save a result after the customer changed their website.
  const saved = await prisma.brand.updateMany({ where: { id: brand.id, organizationId, logoUrl: brand.logoUrl, websiteUrl: brand.websiteUrl }, data: { logoUrl: logo } });
  if (saved.count) return logo;
  return (await prisma.brand.findFirst({ where: { id: brand.id, organizationId }, select: { logoUrl: true } }))?.logoUrl || null;
}
