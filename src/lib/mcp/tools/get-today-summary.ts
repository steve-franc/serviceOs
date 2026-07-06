import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_today_summary",
  title: "Get today's summary",
  description:
    "Summarize today's orders for the signed-in user's business: order count, total revenue, and count by status.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = client(ctx);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from("orders")
      .select("total_amount, status")
      .gte("created_at", start.toISOString());
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    const revenue = rows.reduce((a: number, r: any) => a + (Number(r.total_amount) || 0), 0);
    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status ?? "unknown"] = (byStatus[r.status ?? "unknown"] ?? 0) + 1;
    const summary = { order_count: rows.length, revenue, by_status: byStatus };
    return {
      content: [{ type: "text", text: JSON.stringify(summary) }],
      structuredContent: summary,
    };
  },
});
