import { useQuery } from "@tanstack/react-query";
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
