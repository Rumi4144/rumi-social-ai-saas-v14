import { NextResponse } from "next/server";
import { superAdminContext } from "@/lib/admin/context";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_ACTION, activityStatus, readActivitySession, sessionSpanSeconds, type ActivityRow } from "@/lib/activity/session";

export async function GET(req: Request) {
  try {
    await superAdminContext();
    const params = new URL(req.url).searchParams;
    const query = (params.get("q") || "").trim().slice(0, 100);
    const page = Number(params.get("page") || 0);
    if (!Number.isSafeInteger(page) || page < 0 || page > 10000) {
      return NextResponse.json({ error: "Invalid page." }, { status: 400 });
    }
    const matches = query ? await prisma.user.findMany({ where: { OR: [
      { name: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      { memberships: { some: { organization: { name: { contains: query, mode: "insensitive" } } } } },
    ] }, select: { id: true } }) : null;
    const logs = await prisma.auditLog.findMany({
      where: { action: ACTIVITY_ACTION, ...(matches ? { userId: { in: matches.map(u => u.id) } } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, skip: page * 50,
      select: { id: true, userId: true, organizationId: true, metadata: true },
    });
    const visible = logs.slice(0, 50);
    const [users, organizations] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: visible.flatMap(log => log.userId ? [log.userId] : []) } },
        select: { id: true, name: true, email: true } }),
      prisma.organization.findMany({ where: { id: { in: visible.flatMap(log => log.organizationId ? [log.organizationId] : []) } },
        select: { id: true, name: true } }),
    ]);
    const now = new Date();
    const rows: ActivityRow[] = visible.flatMap(log => {
      const session = readActivitySession(log.metadata);
      if (!session) return [];
      const user = users.find(u => u.id === log.userId);
      const { tabs: _tabs, ...summary } = session;
      return [{ id: log.id, userName: user?.name || user?.email || "Deleted user",
        email: user?.email || "", business: organizations.find(o => o.id === log.organizationId)?.name || "No workspace recorded",
        session: summary, status: activityStatus(session, now), spanSeconds: sessionSpanSeconds(session) }];
    });
    return NextResponse.json({ rows, hasMore: logs.length > 50, updatedAt: now.toISOString() },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: any) {
    const status = error?.message === "UNAUTHENTICATED" ? 401 : error?.message === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "Could not load user activity. Try again." : "Master Admin access is required." }, { status });
  }
}
