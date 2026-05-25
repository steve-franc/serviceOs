// Fetch live prices for active subscription tiers from Dodo Payments so the
// Billing UI can display the seller-configured currency/amount dynamically
// (Dodo handles regional conversion on its checkout).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: settings } = await admin
      .from("platform_settings")
      .select("payment_mode")
      .eq("id", true)
      .maybeSingle();
    const mode = (settings?.payment_mode === "live" ? "live" : "test") as "live" | "test";

    const { data: tiers } = await admin
      .from("subscription_tiers")
      .select("id, dodo_price_id_live, dodo_price_id_test, is_free, price_try")
      .eq("is_active", true);

    const apiKey = Deno.env.get("DODO_PAYMENTS_API_KEY");
    const dodoBase = mode === "live" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";

    const out: Record<string, { amount: number; currency: string; source: "dodo" | "fallback" }> = {};

    await Promise.all(
      (tiers ?? []).map(async (t: any) => {
        const productId = mode === "live" ? t.dodo_price_id_live : t.dodo_price_id_test;
        if (t.is_free || !productId || !apiKey) {
          out[t.id] = { amount: Number(t.price_try ?? 0), currency: "TRY", source: "fallback" };
          return;
        }
        try {
          const res = await fetch(`${dodoBase}/products/${productId}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (!res.ok) throw new Error(`Dodo ${res.status}`);
          const data = await res.json();
          // Dodo product price object: { price: <minor units>, currency: "USD", ... }
          const priceObj = data?.price ?? data;
          const rawAmount = Number(priceObj?.price ?? priceObj?.amount ?? 0);
          const currency = String(priceObj?.currency ?? data?.currency ?? "USD").toUpperCase();
          // Dodo returns amounts in minor units (e.g. cents).
          const zeroDecimal = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "HUF"]);
          const amount = zeroDecimal.has(currency) ? rawAmount : rawAmount / 100;
          out[t.id] = { amount, currency, source: "dodo" };
        } catch (e) {
          console.error("Failed to fetch tier price", t.id, e);
          out[t.id] = { amount: Number(t.price_try ?? 0), currency: "TRY", source: "fallback" };
        }
      })
    );

    return new Response(JSON.stringify({ mode, prices: out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("dodo-tier-prices error", err);
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
