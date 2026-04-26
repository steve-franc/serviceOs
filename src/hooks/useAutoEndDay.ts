import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "@/hooks/useRestaurantAndRole";
import { useUserRole } from "@/hooks/useUserRole";
import { format } from "date-fns";
import { toast } from "sonner";

/**
 * Auto-ends the day at 23:59 local time.
 * - Only runs for managers/staff (not investors / unauthenticated).
 * - Idempotent: checks the latest daily_reports row before inserting; if a
 *   report was already created in the last 5 minutes, skips.
 * - Orders created after midnight will naturally fall into the next day's window.
 */
export function useAutoEndDay() {
  const { restaurantId } = useRestaurantContext();
  const { isInvestor, loading } = useUserRole();
  const ranForDateRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !restaurantId || isInvestor) return;

    let timeoutId: number | undefined;

    const scheduleNext = () => {
      const now = new Date();
      const target = new Date(now);
      target.setHours(23, 59, 0, 0);
      // If we've already passed 23:59 today, schedule for tomorrow.
      if (now >= target) target.setDate(target.getDate() + 1);
      const delay = target.getTime() - now.getTime();
      timeoutId = window.setTimeout(runEndDay, delay);
    };

    const runEndDay = async () => {
      try {
        const today = format(new Date(), "yyyy-MM-dd");
        if (ranForDateRef.current === today) {
          scheduleNext();
          return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { scheduleNext(); return; }

        // Skip if a report was just generated (manual or another tab).
        const { data: lastReport } = await supabase
          .from("daily_reports")
          .select("created_at")
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        if (lastReport && new Date(lastReport.created_at).getTime() > fiveMinAgo) {
          ranForDateRef.current = today;
          scheduleNext();
          return;
        }

        const cutoff = lastReport ? new Date(lastReport.created_at) : new Date(0);

        // Sum paid + confirmed orders since cutoff.
        const { data: ordersData } = await supabase
          .from("orders")
          .select("total, payment_method, status, payment_status")
          .eq("restaurant_id", restaurantId)
          .eq("status", "confirmed")
          .gte("created_at", cutoff.toISOString());

        const paid = (ordersData || []).filter((o: any) => (o.payment_status || "paid") === "paid");
        if (paid.length === 0) {
          ranForDateRef.current = today;
          scheduleNext();
          return;
        }

        const totalRevenue = paid.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
        const pm: Record<string, { count: number; total: number }> = {};
        paid.forEach((o: any) => {
          if (!pm[o.payment_method]) pm[o.payment_method] = { count: 0, total: 0 };
          pm[o.payment_method].count++;
          pm[o.payment_method].total += Number(o.total || 0);
        });

        const { error } = await supabase.from("daily_reports").insert({
          staff_id: user.id,
          restaurant_id: restaurantId,
          report_date: today,
          total_orders: paid.length,
          total_revenue: totalRevenue,
          payment_methods: pm,
        });

        if (!error) {
          ranForDateRef.current = today;
          toast.success("Day auto-ended at 11:59 PM");
        }
      } catch {
        // silent — try again tomorrow
      } finally {
        scheduleNext();
      }
    };

    scheduleNext();
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [restaurantId, isInvestor, loading]);
}
