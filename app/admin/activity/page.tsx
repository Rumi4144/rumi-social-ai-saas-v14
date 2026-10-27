import Link from "next/link";
import { redirect } from "next/navigation";
import { superAdminContext } from "@/lib/admin/context";
import UserActivity from "./UserActivity";

export default async function ActivityPage() {
  try { await superAdminContext(); }
  catch (error: any) { redirect(error?.message === "UNAUTHENTICATED" ? "/login" : "/dashboard"); }
  return <>
    <Link href="/admin">← Back to Master Admin</Link>
    <div style={{ margin: "24px 0" }}>
      <div className="eyebrow">MASTER ADMIN</div>
      <h1>User Activity</h1>
      <p>See recent sign-ins, last activity and estimated time using Rumi.</p>
    </div>
    <UserActivity />
  </>;
}
