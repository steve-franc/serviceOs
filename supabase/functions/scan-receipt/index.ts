import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const tools = [
  {
    type: "function",
    function: {
      name: "extract_receipt",
      description: "Extract structured data from a receipt image.",
      parameters: {
        type: "object",
        properties: {
          supplier: { type: "string", description: "Supplier / store / vendor name. Empty string if unknown." },
          purchase_date: { type: "string", description: "Date in YYYY-MM-DD format. Empty string if unknown." },
          total: { type: "number", description: "Receipt grand total. 0 if unknown." },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Item name as printed on the receipt." },
                qty: { type: "number", description: "Quantity purchased. Default 1." },
                unitPrice: { type: "number", description: "Price per unit." },
                total: { type: "number", description: "Line total = qty * unitPrice." },
              },
              required: ["name", "qty", "unitPrice", "total"],
              additionalProperties: false,
            },
          },
        },
        required: ["supplier", "purchase_date", "total", "items"],
        additionalProperties: false,
      },
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { image_base64, mime_type } = body || {};
    if (typeof image_base64 !== "string" || image_base64.length < 100) {
      return new Response(JSON.stringify({ error: "image_base64 is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const mime = typeof mime_type === "string" && mime_type.startsWith("image/") ? mime_type : "image/jpeg";
    const dataUrl = `data:${mime};base64,${image_base64}`;

    const resp = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You extract structured purchase data from receipt photos. Read carefully, handle Turkish and English text, and call the extract_receipt tool with the items, supplier, date, and total. If a field is unreadable, return an empty string or 0. Never invent items.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract every line item from this receipt." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "extract_receipt" } },
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "AI rate limit reached. Please try again in a moment." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Top up in Settings → Workspace → Usage." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI scan failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = call?.function?.arguments;
    if (!argsStr) {
      return new Response(JSON.stringify({ error: "No structured output from AI" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let parsed: any = {};
    try { parsed = JSON.parse(argsStr); } catch { parsed = {}; }

    const items = Array.isArray(parsed.items) ? parsed.items.filter((i: any) =>
      i && typeof i.name === "string" && i.name.trim() && Number(i.qty) > 0 && Number(i.unitPrice) >= 0
    ).map((i: any) => ({
      name: String(i.name).slice(0, 200),
      qty: Number(i.qty) || 1,
      unitPrice: Number(i.unitPrice) || 0,
      total: Number(i.total) || (Number(i.qty) * Number(i.unitPrice)) || 0,
    })) : [];

    return new Response(
      JSON.stringify({
        supplier: typeof parsed.supplier === "string" ? parsed.supplier : "",
        purchase_date: typeof parsed.purchase_date === "string" ? parsed.purchase_date : "",
        total: Number(parsed.total) || items.reduce((a: number, b: any) => a + b.total, 0),
        items,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("scan-receipt error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
