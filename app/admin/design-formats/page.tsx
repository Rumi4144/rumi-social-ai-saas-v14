import { redirect } from "next/navigation";
import { superAdminContext } from "@/lib/admin/context";
import AdminTabs from "@/components/AdminTabs";
import DesignFormats from "./DesignFormats";

export default async function DesignFormatsPage() {
  try { await superAdminContext(); }
  catch (error: unknown) { redirect(error instanceof Error && error.message === "UNAUTHENTICATED" ? "/login" : "/dashboard"); }
  return <>
    <AdminTabs active="design-formats" />
    <DesignFormats />
  </>;
}
