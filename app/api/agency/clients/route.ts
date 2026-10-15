import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { z } from "zod";
const schema = z.object({ organizationId: z.string().min(1), clientOrganizationId: z.string().min(1), displayName: z.string().trim().min(2).max(100) });
export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "Reload this page and try again." }, { status: 403 });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a client workspace and a name of 2–100 characters." }, { status: 400 });
    const p = parsed.data, ctx = await tenantContext();
    if (ctx.organizationId !== p.organizationId) return NextResponse.json({ error: "Your workspace changed. Reload this page." }, { status: 409 });
    if (!ctx.isSuperAdmin && !["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Only workspace owners and administrators can manage clients." }, { status: 403 });
    if (p.clientOrganizationId === ctx.organizationId) return NextResponse.json({ error: "Choose a different workspace for the client." }, { status: 400 });
    // A client link is organizational metadata, never an access grant.
    const target = await tenantContext(p.clientOrganizationId);
    if (target.organization.status === "suspended") return NextResponse.json({ error: "This client workspace is suspended." }, { status: 403 });
    const data = { displayName: p.displayName, status: "active" };
    const link = await prisma.clientWorkspace.upsert({ where: { agencyOrganizationId_clientOrganizationId: { agencyOrganizationId: ctx.organizationId, clientOrganizationId: target.organizationId } }, update: data, create: { agencyOrganizationId: ctx.organizationId, clientOrganizationId: target.organizationId, ...data } });
    return NextResponse.json({ id: link.id }, { status: 201 });
  } catch (error) { return apiError(error, "Could not save client. Confirm that you have access to its workspace."); }
}
export async function DELETE(req: Request) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "Reload this page and try again." }, { status: 403 });
    const parsed = z.object({ organizationId: z.string().min(1), id: z.string().min(1) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a linked client." }, { status: 400 });
    const ctx = await tenantContext();
    if (ctx.organizationId !== parsed.data.organizationId) return NextResponse.json({ error: "Your workspace changed. Reload this page." }, { status: 409 });
    if (!ctx.isSuperAdmin && !["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Only workspace owners and administrators can manage clients." }, { status: 403 });
    await prisma.clientWorkspace.deleteMany({ where: { id: parsed.data.id, agencyOrganizationId: ctx.organizationId } });
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error, "Could not unlink client."); }
}
