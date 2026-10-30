import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { normalizedWebsite } from "@/lib/website/brand-profile";
import type { WebsiteSetup } from "@/lib/onboarding/website";

const schema = z.object({
  personName: z.string().trim().min(2).max(120).optional(),
  role: z.string().trim().max(120).optional(), // Professional description, never an access role.
  brand: z.string().trim().min(2).max(160),
  website: z.string().trim().max(2000).optional(),
  websiteReviewId: z.string().max(200).optional(),
  businessType: z.string().max(160).optional(),
  industry: z.string().max(120).optional(),
  description: z.string().trim().max(8000).optional(),
  targetAudience: z.string().trim().max(4000).optional(),
  goal: z.string().trim().max(500).optional(),
}).refine(value => Boolean(value.website) || (value.description?.length || 0) >= 10, "Add a website or a short business description.");

export async function POST(request: Request) {
  try {
    const ctx = await tenantContext();
    if (!ctx.isSuperAdmin && !["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Your workspace owner or administrator can set up this business." }, { status: 403 });
    if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter your business name and either a website or a short business description." }, { status: 400 });
    const p = parsed.data;
    let website: string | null = null;
    try { website = p.website ? normalizedWebsite(p.website) : null; }
    catch { return NextResponse.json({ error: "Enter a valid HTTPS business website." }, { status: 400 }); }
    const review = p.websiteReviewId ? await prisma.job.findFirst({ where: { id: p.websiteReviewId, organizationId: ctx.organizationId, type: "ONBOARDING_WEBSITE_REVIEW", status: "succeeded", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }) : null;
    const setup = review?.result as WebsiteSetup | null;
    if (p.websiteReviewId && (!review || !setup || setup.website !== website || setup.brandName !== p.brand)) return NextResponse.json({ error: "Your business name or website changed. Read the website again, or continue without the imported details." }, { status: 409 });
    const result = await prisma.$transaction(async tx => {
      const existing = await tx.brand.findFirst({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" } });
      let savedWebsite = existing?.websiteUrl || null;
      try { savedWebsite = savedWebsite ? normalizedWebsite(savedWebsite) : null; } catch { /* Legacy addresses are not silently replaced. */ }
      if (existing?.onboardingCompleted && (existing.name.trim() !== p.brand || savedWebsite !== website)) throw new Error("ONBOARDING_BRAND_LOCKED");
      const goal = p.goal || existing?.contentGoals || "Brand awareness and useful product or service education";
      const data = {
        name: p.brand, websiteUrl: website,
        industry: p.industry || setup?.suggestions.industry || existing?.industry || null,
        description: p.description || setup?.suggestions.description || existing?.description || null,
        targetAudience: p.targetAudience || setup?.suggestions.targetAudience || existing?.targetAudience || null,
        voice: existing?.voice || setup?.suggestions.voice || "Warm and professional",
        positioning: existing?.positioning || setup?.suggestions.positioning || null,
        preferredWords: existing?.preferredWords || setup?.suggestions.preferredWords || null,
        bannedWords: existing?.bannedWords || setup?.suggestions.bannedWords || null,
        visualRules: existing?.visualRules || setup?.suggestions.visualRules || null,
        // Existing Admin design choices remain authoritative.
        logoUrl: existing?.logoUrl || setup?.logoUrl || null,
        contentGoals: goal, postingFrequency: "Daily", approvalRequired: true, onboardingCompleted: true,
      };
      const brand = existing ? await tx.brand.update({ where: { id: existing.id }, data }) : await tx.brand.create({ data: { organizationId: ctx.organizationId, ...data } });
      if (p.personName) await tx.user.update({ where: { id: ctx.userId }, data: { name: p.personName } });
      const products = setup?.products || [];
      const savedProducts = products.length ? await tx.product.findMany({ where: { brandId: brand.id, sourceUrl: { in: products.map(product => product.sourceUrl) } }, select: { sourceUrl: true } }) : [];
      const savedUrls = new Set(savedProducts.map(product => product.sourceUrl));
      for (const product of products) {
        if (!savedUrls.has(product.sourceUrl)) {
          await tx.product.create({ data: { brandId: brand.id, name: product.label, sourceUrl: product.sourceUrl, imageUrl: product.images[0] || null } });
          savedUrls.add(product.sourceUrl);
        }
        for (const imageUrl of product.images.slice(0, 3)) {
          const present = await tx.mediaAsset.findFirst({ where: { organizationId: ctx.organizationId, campaignId: null, kind: "product_photo", AND: [{ metadata: { path: ["brandId"], equals: brand.id } }, { metadata: { path: ["sourceEvidence", "imageUrl"], equals: imageUrl } }, { metadata: { path: ["sourceUrl"], equals: product.sourceUrl } }] }, select: { id: true } });
          if (!present) await tx.mediaAsset.create({ data: { organizationId: ctx.organizationId, campaignId: null, kind: "product_photo", provider: "website", status: "ready", url: imageUrl,
            metadata: { brandId: brand.id, sourceUrl: product.sourceUrl, productName: product.label, sourceEvidence: { imageUrl, sourceUrl: product.sourceUrl, title: product.label } } } });
        }
      }
      const state = { step: 7, completed: true, businessType: p.businessType || p.industry || setup?.suggestions.industry || "Business", website, goal, completedAt: new Date() };
      await tx.onboardingState.upsert({ where: { organizationId: ctx.organizationId }, update: state, create: { organizationId: ctx.organizationId, userId: ctx.userId, ...state } });
      await tx.auditLog.create({ data: { organizationId: ctx.organizationId, userId: ctx.userId, action: "onboarding_completed", resource: "Brand", resourceId: brand.id,
        metadata: { professionalRole: p.role || null, websiteReviewId: review?.id || null, importedProducts: products.length } } });
      return { brandId: brand.id, importedProducts: products.length };
    }, { isolationLevel: "Serializable", timeout: 20_000 });
    return NextResponse.json({ ...result, organizationId: ctx.organizationId, completed: true });
  } catch (error) {
    if (error instanceof Error && error.message === "ONBOARDING_BRAND_LOCKED") return NextResponse.json({ error: "This business is already set up. Ask Admin to change its name or website, or create a separate business workspace." }, { status: 409 });
    return apiError(error, "Could not save your business setup. Please try again.");
  }
}
