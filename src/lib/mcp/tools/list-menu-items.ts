import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_menu_items",
  title: "List menu items",
  description:
    "List menu items for the signed-in user's business. Returns name, price, category, stock, and availability flags.",
  inputSchema: {
    search: z.string().trim().max(100).default("").describe("Optional case-insensitive name filter. Empty string returns all."),
    limit: z.number().int().min(1).max(200).default(50).describe("Max items to return (1-200)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = client(ctx);
    let query = supabase
      .from("menu_items")
      .select("name, price, category, stock_quantity, is_available, is_public")
      .order("name", { ascending: true })
      .limit(limit);
    if (search) query = query.ilike("name", `%${search}%`);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { items: data ?? [] },
    };
  },
});
