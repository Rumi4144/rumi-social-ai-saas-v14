import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { suggestXCaption } from "@/lib/x/caption";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await tenantContext();
    const { id } = await params;
    const item = await prisma.contentItem.findFirst({ where: { id, campaign: { brand: { organizationId: ctx.organizationId } } }, select: { id: true, caption: true, headline: true, mediaUrl: true } });
    if (!item) return NextResponse.json({ error: "Post not found in this workspace." }, { status: 404 });
    const sourceText = item.caption || item.headline || "";
    return NextResponse.json({ contentItemId: item.id, sourceText, text: suggestXCaption(sourceText), hasMedia: Boolean(item.mediaUrl) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error, "Could not prepare the X caption."); }
}
