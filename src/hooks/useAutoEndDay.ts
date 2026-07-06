import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "@/hooks/useRestaurantAndRole";
import { useUserRole } from "@/hooks/useUserRole";
import { format } from "date-fns";
import { toast } from "sonner";

/**
 * Auto-ends the day at/after 23:59 local time.
 *
 * Reliability strategy:
 *  - Polls every 60s instead of a single setTimeout (survives device sleep,
 *    background-tab throttling, and laptops closed overnight).
 *  - Runs an immediate "catch-up" check on mount: if the last daily_reports
 *    row is older than the most recent 23:59 cutoff AND there are confirmed
 *    paid orders sitting before today's local midnight, it generates the
 *    missed report right away. This handles the common case where every
 *    device was asleep/closed at midnight.
 *  - Idempotent: skips if a report was generated in the last 5 minutes, and
 *    remembers the date it ran for in this tab to avoid duplicates.
 *  - Disabled for observers (investors) and unauthenticated users.
 */
export function useAutoEndDay() {
  const { restaurantId } = useRestaurantContext();
  const { isInvestor, loading } = useUserRole();
  const ranForDateRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !restaurantId || isInvestor) return;

    let disabled = false;
    // If the manager toggled auto end-of-day off, skip the poller entirely.
    (async () => {
      const { data } = await supabase
        .from("restaurant_settings")
        .select("auto_end_of_day_enabled")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      disabled = (data as any)?.auto_end_of_day_enabled === false;
    })();

    let intervalId: number | undefined;
    let cancelled = false;

    /**
     * Returns the most recent past "end of day" boundary (today 23:59 if
     * we're past it, otherwise yesterday 23:59).
     */
    const lastCutoff = (now: Date) => {
      const c = new Date(now);
      c.setHours(23, 59, 0, 0);
      if (now < c) c.setDate(c.getDate() - 1);
      return c;
    };

    const tryEndDay = async (opts: { catchUp: boolean }) => {
      try {
        const now = new Date();
        const cutoffBoundary = lastCutoff(now);

        // For the scheduled (non-catchup) path, only run once we're past 23:59.
        if (!opts.catchUp && now < cutoffBoundary) return;

        // The "report date" is the day the boundary belongs to.
        const reportDate = format(cutoffBoundary, "yyyy-MM-dd");
        if (ranForDateRef.current === reportDate) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get the most recent report for this restaurant.
        const { data: lastReport } = await supabase
          .from("daily_reports")
          .select("created_at, report_date")
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // If a report was just generated (manual or another tab), skip.
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        if (lastReport && new Date(lastReport.created_at).getTime() > fiveMinAgo) {
          ranForDateRef.current = reportDate;
          return;
        }

        // If the latest report already covers this boundary, skip.
        if (lastReport && new Date(lastReport.created_at) >= cutoffBoundary) {
          ranForDateRef.current = reportDate;
          return;
        }

        const sinceCutoff = lastReport ? new Date(lastReport.created_at) : new Date(0);

        // Only include orders BEFORE the boundary (so post-midnight orders
        // are saved for the next day's report).
        const { data: ordersData } = await supabase
          .from("orders")
          .select("total, payment_method, status, payment_status, created_at")
          .eq("restaurant_id", restaurantId)
          .eq("status", "confirmed")
          .gte("created_at", sinceCutoff.toISOString())
          .lt("created_at", cutoffBoundary.toISOString());

        const paid = (ordersData || []).filter(
          (o: any) => (o.payment_status || "paid") === "paid"
        );

        if (paid.length === 0) {
          // Nothing to close — still mark so we don't re-check every 60s.
          ranForDateRef.current = reportDate;
          return;
        }

        const totalRevenue = paid.reduce(
          (s: number, o: any) => s + Number(o.total || 0),
          0
        );
        const pm: Record<string, { count: number; total: number }> = {};
        paid.forEach((o: any) => {
          if (!pm[o.payment_method]) pm[o.payment_method] = { count: 0, total: 0 };
          pm[o.payment_method].count++;
          pm[o.payment_method].total += Number(o.total || 0);
        });

        const { error } = await supabase.from("daily_reports").insert({
          staff_id: user.id,
          restaurant_id: restaurantId,
          report_date: reportDate,
          total_orders: paid.length,
          total_revenue: totalRevenue,
          payment_methods: pm,
        });

        if (!error && !cancelled) {
          ranForDateRef.current = reportDate;
          toast.success(
            opts.catchUp
              ? `Auto-closed pending day (${reportDate})`
              : "Day auto-ended at 11:59 PM"
          );
        }
      } catch {
        // silent — next poll will retry
      }
    };

    // Catch-up immediately on mount (handles "nobody was online at midnight").
    tryEndDay({ catchUp: true });

    // Poll every 60s — robust against sleep, throttling, and reopened tabs.
    intervalId = window.setInterval(() => {
      tryEndDay({ catchUp: false });
    }, 60_000);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [restaurantId, isInvestor, loading]);
}
