import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { configurationChecks, missingTables, readinessResult } from "@/lib/operations/readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let database = false, schema = false;
  try {
    // SELECT 1 alone also succeeds against an empty or incompletely restored DB.
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = current_schema()
    `;
    database = true;
    schema = missingTables(tables).length === 0;
  } catch { /* Never return connection strings or database errors publicly. */ }
  const result = readinessResult(configurationChecks(process.env), database, schema);
  return NextResponse.json({
    service: "Rumi Social AI", version: "14.0.0",
    features: { campaignYouTube: true, youtubeVisibility: true, presenterFromPost: true },
    status: result.ready ? "operational" : "degraded", checks: result.checks,
  }, { status: result.ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
