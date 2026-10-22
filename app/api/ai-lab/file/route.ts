import { get } from "@vercel/blob";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import { labCanRun } from "@/lib/ai-lab/catalog";
export async function GET(req: Request) {
  try {
    const ctx = await tenantContext(); if (!labCanRun(ctx.role)) throw new Error("FORBIDDEN");
    const query = new URL(req.url).searchParams;
    const job = await prisma.job.findFirst({ where: { id: query.get("jobId") || "", organizationId: ctx.organizationId, type: "AI_LAB", status: "succeeded" } });
    const result = job?.result as { pathname?: string; contentType?: string } | null;
    if (!job || !result?.pathname?.startsWith(`ai-lab/${ctx.organizationId}/${job.id}.`)) return new Response("Sample not found", { status: 404 });
    const file = await get(result.pathname, { access: "private" });
    if (file?.statusCode !== 200) return new Response("Sample unavailable", { status: 404 });
    const ext = result.pathname.split(".").pop();
    return new Response(file.stream, { headers: { "Content-Type": result.contentType || "application/octet-stream", "Content-Length": String(file.blob.size), "Cache-Control": "private, no-store", "Content-Disposition": `${query.get("download") === "1" ? "attachment" : "inline"}; filename="rumi-test-${job.id}.${ext}"` } });
  } catch (error) { return apiError(error, "Could not load this test sample."); }
}
