import { auth } from "@/auth";
import { NextResponse } from "next/server";

const protectedRoutes = [
  "/dashboard",
  "/create",
  "/campaigns",
  "/studio",
  "/calendar",
  "/publishing",
  "/library",
  "/analytics",
  "/brand",
  "/billing",
  "/usage",
  "/agency",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isProtected = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isProtected && !req.auth?.user) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/create/:path*",
    "/campaigns/:path*",
    "/studio/:path*",
    "/calendar/:path*",
    "/publishing/:path*",
    "/library/:path*",
    "/analytics/:path*",
    "/brand/:path*",
    "/billing/:path*",
    "/usage/:path*",
    "/agency/:path*",
  ],
};
