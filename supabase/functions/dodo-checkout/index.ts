// Create a Dodo Payments subscription checkout session for the caller's restaurant.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const tierId = String(body?.tier_id || "");
    const returnUrl = String(body?.return_url || "");
    if (!tierId) return json({ error: "tier_id required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // Find the manager's restaurant
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("restaurant_id, role")
      .eq("user_id", userId)
      .eq("role", "manager")
      .maybeSingle();
    if (!roleRow?.restaurant_id) return json({ error: "Only managers can subscribe" }, 403);
    const restaurantId = roleRow.restaurant_id as string;

    // Fetch tier + restaurant + mode
    const [{ data: tier }, { data: restaurant }, { data: settings }] = await Promise.all([
      admin.from("subscription_tiers").select("*").eq("id", tierId).maybeSingle(),
      admin.from("restaurants").select("id, name, dodo_customer_id").eq("id", restaurantId).maybeSingle(),
      admin.from("platform_settings").select("payment_mode").eq("id", true).maybeSingle(),
    ]);
    if (!tier) return json({ error: "Tier not found" }, 404);
    if (tier.is_free) return json({ error: "Cannot subscribe to a free tier" }, 400);

    const mode = (settings?.payment_mode === "live" ? "live" : "test") as "live" | "test";
    const productId = mode === "live" ? tier.dodo_price_id_live : tier.dodo_price_id_test;
    if (!productId) return json({ error: `Tier has no Dodo product ID configured for ${mode} mode` }, 400);

    const dodoBase = mode === "live" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
    const apiKey = Deno.env.get("DODO_PAYMENTS_API_KEY");
    if (!apiKey) return json({ error: "DODO_PAYMENTS_API_KEY not configured" }, 500);

    // Get user email
    const email = userData.user.email || `${userId}@example.com`;
    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
    const name = profile?.full_name || restaurant?.name || "Customer";

    const payload: any = {
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: { email, name },
      return_url: returnUrl || undefined,
      metadata: {
        restaurant_id: restaurantId,
        tier_id: tierId,
        user_id: userId,
      },
    };

    const res = await fetch(`${dodoBase}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let dodoData: any;
    try { dodoData = JSON.parse(text); } catch { dodoData = { raw: text }; }
    if (!res.ok) {
      console.error("Dodo checkout failed", res.status, text);
      return json({ error: "Failed to create checkout", details: dodoData }, 502);
    }

    return json({
      checkout_url: dodoData.checkout_url,
      session_id: dodoData.session_id,
      mode,
    });
  } catch (err: any) {
    console.error("dodo-checkout error", err);
    return json({ error: err?.message || "Internal error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
