import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listRecentOrders from "./tools/list-recent-orders";
import listMenuItems from "./tools/list-menu-items";
import getTodaySummary from "./tools/get-today-summary";

// Build the OAuth issuer from the project ref (inlined by Vite at build time).
// Do NOT read SUPABASE_URL here — on Lovable Cloud it is the proxy host and
// mcp-js will reject tokens whose configured issuer does not match discovery.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "serviceos-mcp",
  title: "serviceOS",
  version: "0.1.0",
  instructions:
    "Tools for a serviceOS business: read recent orders, browse the menu, and get a summary of today's activity. All calls run as the signed-in user under Row-Level Security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listRecentOrders, listMenuItems, getTodaySummary],
});
