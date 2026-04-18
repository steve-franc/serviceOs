import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { toast } from "sonner";
import { openWhatsApp, normalizePhone } from "@/lib/whatsapp";
import { dailyShareOfMonthly } from "@/lib/date-format";

interface Settings {
  profit_margin_threshold: number;
  fixed_monthly_expenses: number;
  whatsapp_phone: string | null;
  notify_low_stock: boolean;
  notify_low_margin: boolean;
}

/**
 * One-shot alerts: low stock + low profit margin.
 * If a WhatsApp number is configured, the toast includes a "Send to WhatsApp" action
 * that opens wa.me with the alert pre-filled.
 */
export function useAlerts() {
  const { restaurantId } = useRestaurantContext();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!restaurantId || checkedRef.current) return;
    checkedRef.current = true;

    const showWhatsAppToast = (
      kind: "warning" | "error",
      message: string,
      phone: string | null,
      durationMs: number,
    ) => {
      const wa = normalizePhone(phone);
      const action = wa
        ? { label: "Send to WhatsApp", onClick: () => openWhatsApp(phone, message) }
        : undefined;
      toast[kind](message, { duration: durationMs, action });
    };

    const checkAlerts = async () => {
      try {
        const settingsRes = await supabase
          .from("restaurant_settings")
          .select("profit_margin_threshold, fixed_monthly_expenses, whatsapp_phone, notify_low_stock, notify_low_margin")
          .eq("restaurant_id", restaurantId)
          .maybeSingle();

        const settings = (settingsRes.data || {}) as Partial<Settings>;
        const phone = settings.whatsapp_phone ?? null;
        const notifyLowStock = settings.notify_low_stock !== false;
        const notifyLowMargin = settings.notify_low_margin !== false;
        const threshold = Number(settings.profit_margin_threshold) || 20;
        const fixedMonthly = Number(settings.fixed_monthly_expenses) || 0;

        // Low stock
        if (notifyLowStock) {
          const { data: lowStock } = await supabase
            .from("menu_items")
            .select("name, stock_qty")
            .eq("restaurant_id", restaurantId)
            .eq("is_inventory_item", true)
            .lte("stock_qty", 5)
            .eq("is_available", true);

          if (lowStock && lowStock.length > 0) {
            const names = lowStock.map(i => `${i.name} (${i.stock_qty} left)`).join(", ");
            showWhatsAppToast("warning", `Low stock alert: ${names}`, phone, 10000);
          }
        }

        // Low margin
        if (notifyLowMargin) {
          const { data: lastReport } = await supabase
            .from("daily_reports")
            .select("created_at")
            .eq("restaurant_id", restaurantId)
            .order("created_at", { ascending: false })
            .limit(1).maybeSingle();
          const cutoff = lastReport ? new Date(lastReport.created_at) : new Date(0);

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
          const dailyFixed = dailyShareOfMonthly(fixedMonthly);
          const netProfit = revenue - expenseTotal - dailyFixed;
          const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

          if (revenue > 0 && margin < threshold) {
            const msg = `Low profit margin: ${margin.toFixed(1)}% (threshold: ${threshold}%). Revenue: ₺${revenue.toFixed(2)}, Expenses: ₺${(expenseTotal + dailyFixed).toFixed(2)}`;
            showWhatsAppToast("warning", msg, phone, 15000);
          }
        }
      } catch {
        // silent
      }
    };

    const timer = setTimeout(checkAlerts, 3000);
    return () => clearTimeout(timer);
  }, [restaurantId]);
}
