// Keep old links safe: this endpoint now requires Master Admin and saves only
// the shared app configuration. Customers cannot change developer credentials.
export { POST } from "@/app/api/admin/social/x/configure/route";
