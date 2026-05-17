// Dodo Payments webhook handler. Verifies standard-webhooks signature and updates subscription state.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  const secret = Deno.env.get("DODO_WEBHOOK_SECRET");
  if (!secret) {
    console.error("DODO_WEBHOOK_SECRET not configured");
    return new Response("misconfigured", { status: 500 });
  }

  let event: any;
  try {
    const wh = new Webhook(secret);
    const headers = {
      "webhook-id": req.headers.get("webhook-id") || "",
      "webhook-signature": req.headers.get("webhook-signature") || "",
      "webhook-timestamp": req.headers.get("webhook-timestamp") || "",
    };
    event = wh.verify(raw, headers);
  } catch (err) {
    console.error("Webhook verification failed", err);
    return new Response("invalid signature", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const type: string = event?.type || "";
    const data: any = event?.data || {};
    const metadata: any = data.metadata || {};
    const restaurantId: string | undefined =
      metadata.restaurant_id ||
      (await lookupRestaurantBySubscription(admin, data.subscription_id, data.customer?.customer_id));
    const tierId: string | undefined =
      metadata.tier_id ||
      (await lookupTierByProduct(admin, data.product_id || data.product_cart?.[0]?.product_id));

    console.log("Dodo webhook", type, { restaurantId, tierId, sub: data.subscription_id });

    // Log raw event
    await admin.from("billing_events").insert({
      restaurant_id: restaurantId || null,
      event_type: type,
      dodo_event_id: req.headers.get("webhook-id") || null,
      dodo_subscription_id: data.subscription_id || null,
      amount_try: data.total_amount ? Number(data.total_amount) / 100 : null,
      payload: event,
    });

    if (!restaurantId) return new Response("ok", { status: 200 });

    const update: Record<string, unknown> = {};
    switch (type) {
      case "payment.succeeded":
      case "subscription.created":
      case "subscription.active":
      case "subscription.renewed": {
        update.subscription_status = "active";
        if (tierId) update.tier_id = tierId;
        if (data.subscription_id) update.dodo_subscription_id = data.subscription_id;
        if (data.customer?.customer_id) update.dodo_customer_id = data.customer.customer_id;
        if (data.next_billing_date) update.current_period_end = data.next_billing_date;
        break;
      }
      case "subscription.on_hold":
        update.subscription_status = "on_hold";
        break;
      case "subscription.failed":
        update.subscription_status = "failed";
        break;
      case "subscription.cancelled":
      case "subscription.canceled":
        update.subscription_status = "cancelled";
        break;
      case "subscription.updated": {
        if (data.status) {
          const map: Record<string, string> = {
            active: "active",
            on_hold: "on_hold",
            cancelled: "cancelled",
            canceled: "cancelled",
            failed: "failed",
            expired: "cancelled",
          };
          if (map[data.status]) update.subscription_status = map[data.status];
        }
        if (tierId) update.tier_id = tierId;
        if (data.next_billing_date) update.current_period_end = data.next_billing_date;
        break;
      }
      default:
        break;
    }

    if (Object.keys(update).length) {
      const { error } = await admin.from("restaurants").update(update).eq("id", restaurantId);
      if (error) console.error("Restaurant update failed", error);
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("Webhook handler error", err);
    return new Response("error", { status: 500 });
  }
});

async function lookupRestaurantBySubscription(admin: any, subId?: string, custId?: string) {
  if (subId) {
    const { data } = await admin.from("restaurants").select("id").eq("dodo_subscription_id", subId).maybeSingle();
    if (data?.id) return data.id as string;
  }
  if (custId) {
    const { data } = await admin.from("restaurants").select("id").eq("dodo_customer_id", custId).maybeSingle();
    if (data?.id) return data.id as string;
  }
  return undefined;
}

async function lookupTierByProduct(admin: any, productId?: string) {
  if (!productId) return undefined;
  const { data } = await admin
    .from("subscription_tiers")
    .select("id")
    .or(`dodo_price_id_test.eq.${productId},dodo_price_id_live.eq.${productId}`)
    .maybeSingle();
  return data?.id as string | undefined;
}
