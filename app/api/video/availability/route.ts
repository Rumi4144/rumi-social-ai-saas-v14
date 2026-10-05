import { NextResponse } from "next/server";
import { runwayConfigured } from "@/lib/video/runway";
// Public feature readiness only; never return credentials, account details or balances.
export const dynamic = "force-dynamic";
export async function GET() {
  const runway = Boolean(process.env.RUNWAY_PRODUCTION_API_KEY || process.env.RUNWAY_API_KEY);
  const storage = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  return NextResponse.json({ available: runwayConfigured(), runwayConnected: runway, storageConnected: storage }, { headers: { "Cache-Control": "no-store" } });
}
