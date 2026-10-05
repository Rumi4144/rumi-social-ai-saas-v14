import { tenantContext } from "@/lib/auth/context";
import { superAdminContext } from "@/lib/admin/context";
export async function studioPageContext() {
  try { return { context: await tenantContext(), recovery: null }; }
  catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "UNAUTHENTICATED") return { context: null, recovery: { title: "Sign in to open the studio", description: "Your session has ended. Sign in again to continue.", href: "/login", action: "Sign in" } };
    if (code === "FORBIDDEN") return { context: null, recovery: { title: "Select an accessible workspace", description: "The current workspace is unavailable to this account. Return to your account to choose a workspace.", href: "/post-login", action: "Return to your account" } };
    if (code === "WORKSPACE_SUSPENDED") return { context: null, recovery: { title: "Workspace temporarily unavailable", description: "This workspace is suspended. Contact your workspace administrator.", href: "/post-login", action: "Return to your account" } };
    if (code !== "NO_WORKSPACE") throw error;
    let admin = false;
    try { await superAdminContext(); admin = true; } catch (error) { if (!(error instanceof Error) || !["UNAUTHENTICATED", "FORBIDDEN"].includes(error.message)) throw error; }
    return { context: null, recovery: admin ? { title: "Choose a workspace to open the studio", description: "The studio uses the selected workspace’s campaigns, products and credits. Open a workspace from your administrator dashboard, then return here.", href: "/admin", action: "Choose a workspace" } : { title: "Set up your workspace", description: "Create or join your workspace before opening its campaigns and studio.", href: "/onboarding", action: "Set up workspace" } };
  }
}
