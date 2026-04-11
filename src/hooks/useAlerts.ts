import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { toast } from "sonner";

/**
 * Shows toast alerts for low profit margin and low stock items
 */
export function useAlerts() {
  const { restaurantId } = useRestaurantContext();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!restaurantId || checked) return;
    setChecked(true);

    const checkAlerts = async () => {
      try {
        // Check low stock items
        const { data: lowStock } = await supabase
          .from("menu_items")
          .select("name, stock_qty")
          .eq("restaurant_id", restaurantId)
          .eq("is_inventory_item", true)
          .lte("stock_qty", 5)
          .eq("is_available", true);

        if (lowStock && lowStock.length > 0) {
          const names = lowStock.map(i => `${i.name} (${i.stock_qty} left)`).join(", ");
          toast.warning(`Low stock alert: ${names}`, { duration: 10000 });
        }

        // Check profit margin
        const [settingsRes, reportsRes] = await Promise.all([
          supabase.from("restaurant_settings")
            .select("profit_margin_threshold, fixed_monthly_expenses")
            .eq("restaurant_id", restaurantId).maybeSingle(),
          supabase.from("daily_reports")
            .select("created_at")
            .eq("restaurant_id", restaurantId)
            .order("created_at", { ascending: false })
            .limit(1).maybeSingle(),
        ]);

        const threshold = Number((settingsRes.data as any)?.profit_margin_threshold) || 20;
        const fixedMonthly = Number((settingsRes.data as any)?.fixed_monthly_expenses) || 0;
        const cutoff = reportsRes.data ? new Date(reportsRes.data.created_at) : new Date(0);

        const [ordersRes, expensesRes] = await Promise.all([
          supabase.from("orders").select("total")
            .eq("restaurant_id", restaurantId).eq("status", "confirmed")
            .gte("created_at", cutoff.toISOString()),
          supabase.from("daily_expenses").select("amount")
            .eq("restaurant_id", restaurantId)
            .gte("created_at", cutoff.toISOString()),
        ]);

        const revenue = (ordersRes.data || []).reduce((s, o) => s + Number(o.total), 0);
        const expenseTotal = (expensesRes.data || []).reduce((s, e) => s + Number(e.amount), 0);
        const dailyFixed = fixedMonthly / 30;
        const netProfit = revenue - expenseTotal - dailyFixed;
        const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

        if (revenue > 0 && margin < threshold) {
          toast.warning(
            `Low profit margin: ${margin.toFixed(1)}% (threshold: ${threshold}%). Revenue: ₺${revenue.toFixed(2)}, Expenses: ₺${(expenseTotal + dailyFixed).toFixed(2)}`,
            { duration: 15000 }
          );
        }
      } catch {
        // silent
      }
    };

    // Check after a short delay to not block initial render
    const timer = setTimeout(checkAlerts, 3000);
    return () => clearTimeout(timer);
  }, [restaurantId, checked]);
}
