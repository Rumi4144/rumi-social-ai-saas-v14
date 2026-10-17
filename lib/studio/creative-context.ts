import { prisma } from "@/lib/prisma";

export type StudioBrand = {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  designStyle?: string;
};

export async function studioBrand(organizationId: string, organizationName: string): Promise<StudioBrand> {
  const brand = await prisma.brand.findFirst({
    where: { organizationId }, orderBy: { createdAt: "desc" },
    select: { name: true, primaryColor: true, secondaryColor: true, accentColor: true, headingFont: true, bodyFont: true, designStyle: true },
  });
  return {
    name: brand?.name || organizationName,
    primaryColor: brand?.primaryColor || "#173d36",
    secondaryColor: brand?.secondaryColor || "#ffffff",
    accentColor: brand?.accentColor || "#d9bd7a",
    headingFont: brand?.headingFont || "Arial",
    bodyFont: brand?.bodyFont || "Arial",
    designStyle: brand?.designStyle || undefined,
  };
}
