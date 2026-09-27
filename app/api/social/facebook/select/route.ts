import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import { tenantContext } from "@/lib/auth/context";

export async function POST(req: Request) {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://rumisocialai.com";

  try {
    const ctx = await tenantContext();

    const formData = await req.formData();
    const jobId = String(formData.get("jobId") || "");
    const pageId = String(formData.get("pageId") || "");

    if (!jobId || !pageId) {
      throw new Error("FACEBOOK_PAGE_SELECTION_INVALID");
    }

    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        organizationId: ctx.organizationId,
        type: "facebook_page_selection",
        status: "pending",
      },
    });

    if (!job) {
      throw new Error("FACEBOOK_PAGE_SELECTION_NOT_FOUND");
    }

    const payload = job.payload as {
      userId?: string;
      encryptedPages?: string;
    };

    if (!payload.encryptedPages) {
      throw new Error("FACEBOOK_PAGE_SELECTION_DATA_MISSING");
    }

    const pages = JSON.parse(
      decryptSecret(payload.encryptedPages)
    ) as Array<{
      id: string;
      name: string;
      accessToken: string;
      tasks?: string[];
    }>;

    const page = pages.find((item) => item.id === pageId);

    if (!page || !page.accessToken) {
      throw new Error("FACEBOOK_PAGE_NOT_ALLOWED");
    }

    const encryptedToken = encryptSecret(
      JSON.stringify({
        pageAccessToken: page.accessToken,
        pageId: page.id,
        tasks: page.tasks || [],
      })
    );

    const existing =
      await prisma.socialConnection.findFirst({
        where: {
          organizationId: ctx.organizationId,
          provider: "facebook",
        },
      });

    if (existing) {
      await prisma.socialConnection.update({
        where: { id: existing.id },
        data: {
          accountName: page.name,
          externalId: page.id,
          status: "connected",
          encryptedToken,
        },
      });
    } else {
      await prisma.socialConnection.create({
        data: {
          organizationId: ctx.organizationId,
          provider: "facebook",
          accountName: page.name,
          externalId: page.id,
          status: "connected",
          encryptedToken,
        },
      });
    }

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "completed",
        progress: 100,
      },
    });

    return NextResponse.redirect(
      `${appUrl}/settings?facebook=connected`,
      303
    );
  } catch (error) {
    console.error("Facebook Page selection failed", error);

    return NextResponse.redirect(
      `${appUrl}/settings?facebook=error&reason=page_selection`,
      303
    );
  }
}
