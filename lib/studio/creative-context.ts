import { prisma } from "@/lib/prisma";

export type StudioBrand = {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  logoUrl?: string;
  designStyle?: string;
  products?: Array<{ id: string; name: string; description: string; imageUrl?: string }>;
};

export async function studioBrand(organizationId: string, organizationName: string): Promise<StudioBrand> {
  const brand = await prisma.brand.findFirst({
    where: { organizationId }, orderBy: { createdAt: "desc" },
    select: {
      name: true, primaryColor: true, secondaryColor: true, accentColor: true,
      headingFont: true, bodyFont: true, logoUrl: true, designStyle: true,
      products: { select: { id: true, name: true, description: true, imageUrl: true }, orderBy: { createdAt: "desc" } },
    },
  });
  return {
    name: brand?.name || organizationName,
    primaryColor: brand?.primaryColor || "#173d36",
    secondaryColor: brand?.secondaryColor || "#ffffff",
    accentColor: brand?.accentColor || "#d9bd7a",
    headingFont: brand?.headingFont || "Arial",
    bodyFont: brand?.bodyFont || "Arial",
    logoUrl: brand?.logoUrl || undefined,
    designStyle: brand?.designStyle || undefined,
    products: brand?.products?.map(product => ({
      ...product,
      description: product.description || "",
      imageUrl: product.imageUrl || undefined,
    })) || [],
  };
}
