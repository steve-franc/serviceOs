import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSuperOverview() {
  return useQuery({
    queryKey: ["super", "overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_overview");
      if (error) throw error;
      return data as any;
    },
  });
}

export function useSuperRestaurants() {
  return useQuery({
    queryKey: ["super", "restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_list_restaurants");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export function useSuperOrders(limit = 200) {
  return useQuery({
    queryKey: ["super", "orders", limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_list_orders", { _limit: limit });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export function useSuperDailyTrend(days = 30) {
  return useQuery({
    queryKey: ["super", "trend", days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_daily_trend", { _days: days });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export function useSuperTopProducts(limit = 20) {
  return useQuery({
    queryKey: ["super", "products", limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_top_products", { _limit: limit });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export function useSuperRestaurantDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["super", "restaurant", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_get_restaurant", { _restaurant_id: id });
      if (error) throw error;
      return data as any;
    },
  });
}

export function useSuperMenu(restaurantId: string | undefined) {
  return useQuery({
    queryKey: ["super", "menu", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_get_menu", { _restaurant_id: restaurantId });
      if (error) throw error;
      return data as any;
    },
  });
}

export function useSuperUsers() {
  return useQuery({
    queryKey: ["super", "users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_list_users");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export function useSubscriptionTiers() {
  return useQuery({
    queryKey: ["super", "tiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_tiers")
        .select("*")
        .order("display_order", { ascending: true })
        .order("price_try", { ascending: true });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export function useUpsertTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string | null;
      slug: string;
      name: string;
      price_try: number;
      dodo_price_id_test?: string | null;
      dodo_price_id_live?: string | null;
      features: Record<string, any>;
      display_order: number;
      is_active: boolean;
      is_free: boolean;
    }) => {
      const { data, error } = await supabase.rpc("superadmin_upsert_tier", {
        _id: input.id,
        _slug: input.slug,
        _name: input.name,
        _price_try: input.price_try,
        _dodo_price_id_test: input.dodo_price_id_test ?? "",
        _dodo_price_id_live: input.dodo_price_id_live ?? "",
        _features: input.features as any,
        _display_order: input.display_order,
        _is_active: input.is_active,
        _is_free: input.is_free,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["super"] }),
  });
}

export function useDeleteTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("superadmin_delete_tier", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["super"] }),
  });
}

export function useAssignRestaurantTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { restaurant_id: string; tier_id: string }) => {
      const { error } = await supabase.rpc("superadmin_assign_tier", {
        _restaurant_id: input.restaurant_id,
        _tier_id: input.tier_id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["super"] }),
  });
}
