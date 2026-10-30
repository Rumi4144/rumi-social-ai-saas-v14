import { redirect } from "next/navigation";
import { superAdminContext } from "@/lib/admin/context";

export default async function AdminCreativeBoundary({ children }: { children: React.ReactNode }) {
  try { await superAdminContext(); }
  catch (error) { redirect(error instanceof Error && error.message === "UNAUTHENTICATED" ? "/login" : "/dashboard"); }
  return children;
}
