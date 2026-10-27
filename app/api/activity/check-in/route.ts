import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "@/lib/activity/store";

const Input = z.object({ tabId: z.string().uuid(), sessionId: z.string().uuid(), visible: z.boolean(),
  idleSeconds: z.number().int().min(0).max(86400) }).strict();

export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id;
    const activity = (session as any)?.activity;
    if (!userId || !activity?.id) return new NextResponse(null, { status: 401 });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return new NextResponse(null, { status: 401 });
    const input = Input.safeParse(await req.json().catch(() => null));
    if (!input.success) return NextResponse.json({ error: "Invalid activity check-in." }, { status: 400 });
    // An old tab must not attribute activity to a new sign-in in this browser.
    if (input.data.sessionId !== activity.id) return new NextResponse(null, { status: 401 });
    let organizationId: string | null = null;
    try { organizationId = (await tenantContext()).organizationId; }
    catch (error: any) {
      if (error?.message !== "NO_WORKSPACE") return new NextResponse(null, { status: 403 });
    }
    await recordActivity({ userId, sessionId: activity.id, signedInAt: activity.signedInAt },
      { kind: "check-in", checkIn: input.data, organizationId });
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
