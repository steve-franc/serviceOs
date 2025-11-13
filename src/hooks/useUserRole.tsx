import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type UserRole = "admin" | "restaurant" | "user" | null;

export function useUserRole() {
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserRole();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchUserRole();
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data?.role) {
        setRole(data.role as UserRole);
      } else {
        setRole("user"); // Default to user role
      }
    } catch (error) {
      console.error("Error fetching user role:", error);
      setRole("user"); // Default to user on error
    } finally {
      setLoading(false);
    }
  };

  return { 
    role, 
    loading, 
    isAdmin: role === "admin",
    isRestaurant: role === "restaurant",
    isUser: role === "user"
  };
}
