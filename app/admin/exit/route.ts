import { NextResponse } from "next/server";
import { superAdminContext } from "@/lib/admin/context";

export async function GET(request: Request) {
  try {
    await superAdminContext();

    const response = NextResponse.redirect(new URL("/admin", request.url));

    response.cookies.delete("adminWorkspace");

    return response;
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
