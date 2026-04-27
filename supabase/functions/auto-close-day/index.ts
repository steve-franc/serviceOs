// Server-side automated end-of-day for every restaurant.
// Called by pg_cron every 10 minutes. For each restaurant, it computes the
// local time using the restaurant's configured `timezone` and, if it's within
// the closing window (23:59 -> 00:09 local) and no report exists for the
// local date yet, it calls the `close_day_for_restaurant` SQL function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function localHm(tz: string, now: Date) {
  // Returns { h, m } for the given IANA timezone using Intl.
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return { h, m };
  } catch {
    return { h: -1, m: -1 };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const now = new Date();
  const results: Array<Record<string, unknown>> = [];

  // Force-close mode for manual triggering / debugging.
  let force = false;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      force = !!body?.force;
    }
  } catch {
    /* ignore */
  }

  const { data: settings, error } = await supabase
    .from("restaurant_settings")
    .select("restaurant_id, timezone");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  for (const row of settings ?? []) {
    const tz = row.timezone || "Europe/Istanbul";
    const { h, m } = localHm(tz, now);

    // Window: 23:59 OR 00:00..00:09 local time. Cron runs every ~10 min so
    // this gives us at least one fire inside the window. `force` overrides.
    const inWindow = (h === 23 && m >= 59) || (h === 0 && m <= 9);
    if (!inWindow && !force) {
      continue;
    }

    const { data, error: rpcError } = await supabase.rpc("close_day_for_restaurant", {
      _restaurant_id: row.restaurant_id,
    });

    results.push({
      restaurant_id: row.restaurant_id,
      tz,
      local_time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      result: data ?? null,
      error: rpcError?.message ?? null,
    });
  }

  return new Response(JSON.stringify({ ran_at: now.toISOString(), results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
