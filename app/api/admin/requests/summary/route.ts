import { NextResponse } from "next/server";
import { superAdminContext } from "@/lib/admin/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
export async function GET() {
  try {
    await superAdminContext();
    const count = await prisma.job.count({ where: { type: "CONTENT_CHANGE_REQUEST", status: "pending" } });
    return NextResponse.json({ count }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error, "Could not load customer requests."); }
}
