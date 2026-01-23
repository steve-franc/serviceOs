import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";

export type UserRole = "server" | "ops" | "counter" | "manager" | null;

export function useUserRole() {
  const { restaurantId, loading: restaurantLoading } = useRestaurantContext();
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (restaurantLoading) return;
    fetchUserRole();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => fetchUserRole(), 0);
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantLoading, restaurantId]);

  const fetchUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user || !restaurantId) {
        setRole(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      setRole((data?.role as UserRole) ?? null);
    } catch (error) {
      console.error("Error fetching user role:", error);
      setRole(null);
    } finally {
      setLoading(false);
    }
  };

  return {
    role,
    loading,
    restaurantId,
    hasRole: role !== null,
    isManager: role === "manager",
    isOps: role === "ops",
    isCounter: role === "counter",
    isServer: role === "server",
  };
}
