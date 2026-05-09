import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "@/hooks/useRestaurantAndRole";
import { toast } from "sonner";
import { useEffect } from "react";

// ── Menu Items ──────────────────────────────────────────────
export function useMenuItems(availableOnly = false) {
  const { restaurantId } = useRestaurantContext();
  const qc = useQueryClient();

  // Subscribe to realtime changes on menu_items
  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`menu-items-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items', filter: `restaurant_id=eq.${restaurantId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["menu-items", restaurantId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, qc]);

  return useQuery({
    queryKey: ["menu-items", restaurantId, availableOnly],
    queryFn: async () => {
      let query = supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .order("category", { ascending: true })
        .order("name", { ascending: true });
      if (availableOnly) query = query.eq("is_available", true);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
  });
}

export function useInvalidateMenuItems() {
  const qc = useQueryClient();
  const { restaurantId } = useRestaurantContext();
  return () => qc.invalidateQueries({ queryKey: ["menu-items", restaurantId] });
}

// ── Orders ──────────────────────────────────────────────────
export function useOrders() {
  const { restaurantId } = useRestaurantContext();
  return useQuery({
    queryKey: ["orders", restaurantId],
    queryFn: async () => {
      // Get daily reports
      const { data: reportsData } = await supabase
        .from("daily_reports")
        .select("id, report_date, total_orders, total_revenue, created_at")
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: false });

      const lastReport = reportsData?.[0];
      const cutoffDate = lastReport ? new Date(lastReport.created_at) : new Date(0);

      // Get all orders
      const { data: allOrders, error } = await supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const recent: typeof allOrders = [];
      const archived: typeof allOrders = [];
      allOrders?.forEach((order: any) => {
        // For paid orders, bucket by when they were actually paid (paid_at).
        // This way an old unpaid order that gets settled today shows up in today's pool.
        const isPaid = (order.payment_status ?? "paid") === "paid";
        const bucketTs = isPaid && order.paid_at
          ? new Date(order.paid_at)
          : new Date(order.created_at);
        if (bucketTs >= cutoffDate) {
          recent.push(order);
        } else {
          archived.push(order);
        }
      });

      return {
        recentOrders: recent || [],
        archivedOrders: archived || [],
        dailyReports: reportsData || [],
        lastEndDayDate: lastReport?.created_at ?? null,
      };
    },
    enabled: !!restaurantId,
  });
}

export function useInvalidateOrders() {
  const qc = useQueryClient();
  const { restaurantId } = useRestaurantContext();
  return () => qc.invalidateQueries({ queryKey: ["orders", restaurantId] });
}

// ── Inventory ───────────────────────────────────────────────
export function useInventory() {
  const { restaurantId } = useRestaurantContext();
  return useQuery({
    queryKey: ["inventory", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
  });
}

export function useInvalidateInventory() {
  const qc = useQueryClient();
  const { restaurantId } = useRestaurantContext();
  return () => qc.invalidateQueries({ queryKey: ["inventory", restaurantId] });
}

// ── Tabs ────────────────────────────────────────────────────
export function useTabs() {
  const { restaurantId } = useRestaurantContext();
  return useQuery({
    queryKey: ["tabs", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tabs")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .eq("status", "open")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
  });
}

export function useInvalidateTabs() {
  const qc = useQueryClient();
  const { restaurantId } = useRestaurantContext();
  return () => qc.invalidateQueries({ queryKey: ["tabs", restaurantId] });
}

// ── Expenses ────────────────────────────────────────────────
export function useExpenses() {
  const { restaurantId } = useRestaurantContext();
  return useQuery({
    queryKey: ["expenses", restaurantId],
    queryFn: async () => {
      const { data: lastReport } = await supabase
        .from("daily_reports")
        .select("created_at")
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const cutoffDate = lastReport ? new Date(lastReport.created_at) : new Date(0);

      const { data, error } = await supabase
        .from("daily_expenses")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .is("applies_to_report_id", null)
        .gte("created_at", cutoffDate.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
  });
}

// Past closed daily reports — for backdating expenses to a previous day
export function usePastReports() {
  const { restaurantId } = useRestaurantContext();
  return useQuery({
    queryKey: ["past-reports", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_reports")
        .select("id, report_date, created_at, total_revenue")
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
  });
}

// Distinct historical expense sources (last 60 days), for "source of funds" autocomplete
export function useHistoricalExpenseSources() {
  const { restaurantId } = useRestaurantContext();
  return useQuery({
    queryKey: ["expense-sources", restaurantId],
    queryFn: async () => {
      const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("daily_expenses")
        .select("source, created_at")
        .eq("restaurant_id", restaurantId!)
        .gte("created_at", since)
        .not("source", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const seen = new Map<string, string>(); // source -> ISO date of most recent use
      (data || []).forEach((row: any) => {
        if (row.source && !seen.has(row.source)) seen.set(row.source, row.created_at);
      });
      return Array.from(seen.entries()).map(([source, lastUsed]) => ({ source, lastUsed }));
    },
    enabled: !!restaurantId,
  });
}

export function useInvalidateExpenses() {
  const qc = useQueryClient();
  const { restaurantId } = useRestaurantContext();
  return () => qc.invalidateQueries({ queryKey: ["expenses", restaurantId] });
}

// ── Menu Tags ───────────────────────────────────────────────
export function useMenuTags() {
  const { restaurantId } = useRestaurantContext();
  return useQuery({
    queryKey: ["menu-tags", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_tags")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
  });
}

export function useInvalidateMenuTags() {
  const qc = useQueryClient();
  const { restaurantId } = useRestaurantContext();
  return () => qc.invalidateQueries({ queryKey: ["menu-tags", restaurantId] });
}

// ── Restaurant Settings ─────────────────────────────────────
export function useRestaurantSettings() {
  const { restaurantId } = useRestaurantContext();
  return useQuery({
    queryKey: ["restaurant-settings", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_settings")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });
}
