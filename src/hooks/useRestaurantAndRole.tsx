import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type UserRole = "server" | "ops" | "counter" | "manager" | "investor" | "superadmin" | null;

interface RestaurantRoleState {
  user: User | null;
  restaurantId: string | null;
  restaurantName: string | null;
  restaurantStatus: string | null;
  logoUrl: string | null;
  role: UserRole;
  authLoading: boolean;
  loading: boolean;
  hasRole: boolean;
  isManager: boolean;
  isOps: boolean;
  isCounter: boolean;
  isServer: boolean;
  isInvestor: boolean;
  isSuperadmin: boolean;
  /** True when role can view reports/admin (manager OR investor) */
  canViewReports: boolean;
}

const RestaurantRoleContext = createContext<RestaurantRoleState>({
  user: null,
  restaurantId: null,
  restaurantName: null,
  logoUrl: null,
  role: null,
  authLoading: true,
  loading: true,
  hasRole: false,
  isManager: false,
  isOps: false,
  isCounter: false,
  isServer: false,
  isInvestor: false,
  canViewReports: false,
});

export function RestaurantRoleProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadAll = async (initialUser?: User | null) => {
      try {
        let currentUser = initialUser;

        if (typeof currentUser === "undefined") {
          const { data: sessionData } = await supabase.auth.getSession();
          currentUser = sessionData.session?.user ?? null;
        }

        if (cancelled) return;

        setUser(currentUser);
        setAuthLoading(false);

        if (!currentUser) {
          setUser(null);
          setRestaurantId(null);
          setRestaurantName(null);
          setLogoUrl(null);
          setRole(null);
          setLoading(false);
          return;
        }

        setLoading(true);

        // 1) Load membership
        let { data: membership } = await supabase
          .from("restaurant_memberships")
          .select("restaurant_id")
          .eq("user_id", currentUser.id)
          .maybeSingle();

        // 2) If missing, try onboarding from metadata
        if (!membership?.restaurant_id) {
          const meta: any = currentUser.user_metadata || {};
          const onboardingMode = meta.onboarding_mode as string | undefined;

          if (onboardingMode === "join" && meta.join_restaurant_id) {
            const joinId = String(meta.join_restaurant_id);
            await supabase.from("restaurant_memberships").insert({
              user_id: currentUser.id,
              restaurant_id: joinId,
            });
            if (cancelled) return;
            membership = { restaurant_id: joinId };
          }

          if (onboardingMode === "create" && meta.create_restaurant_name) {
            const name = String(meta.create_restaurant_name);
            const { data: created } = await supabase
              .from("restaurants")
              .insert({ name, created_by: currentUser.id })
              .select("id, name")
              .single();
            if (created) {
              await supabase.from("restaurant_memberships").insert({
                user_id: currentUser.id,
                restaurant_id: created.id,
              });
              await supabase.from("user_roles").insert({
                user_id: currentUser.id,
                role: "manager",
                restaurant_id: created.id,
              });
              if (cancelled) return;
              membership = { restaurant_id: created.id };
              setRestaurantName(created.name);
            }
          }
        }

        if (cancelled) return;
        const rid = membership?.restaurant_id ?? null;
        setRestaurantId(rid);

        if (rid) {
          // Fetch restaurant name + role + logo in parallel
          const [restaurantRes, roleRes, settingsRes] = await Promise.all([
            supabase.from("restaurants").select("name").eq("id", rid).maybeSingle(),
            supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", currentUser.id)
              .eq("restaurant_id", rid)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase.from("restaurant_settings").select("logo_url").eq("restaurant_id", rid).maybeSingle(),
          ]);

          if (cancelled) return;
          setRestaurantName(restaurantRes.data?.name ?? null);
          setRole((roleRes.data?.role as UserRole) ?? null);
          setLogoUrl((settingsRes.data as any)?.logo_url ?? null);
        }
      } catch (err) {
        console.error("Error loading restaurant/role:", err);
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
          setLoading(false);
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;

      setUser(session?.user ?? null);
      setAuthLoading(false);
      setLoading(true);
      setTimeout(() => loadAll(session?.user ?? null), 0);
    });

    loadAll();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const isManager = role === "manager";
  const isInvestor = role === "investor";

  const value: RestaurantRoleState = {
    user,
    restaurantId,
    restaurantName,
    logoUrl,
    role,
    authLoading,
    loading,
    hasRole: role !== null,
    isManager,
    isOps: role === "ops",
    isCounter: role === "counter",
    isServer: role === "server",
    isInvestor,
    canViewReports: isManager || isInvestor,
  };

  return (
    <RestaurantRoleContext.Provider value={value}>
      {children}
    </RestaurantRoleContext.Provider>
  );
}

export function useRestaurantAndRole() {
  return useContext(RestaurantRoleContext);
}

// Backwards-compatible hooks that delegate to the shared context
export function useRestaurantContext() {
  const ctx = useRestaurantAndRole();
  return {
    restaurantId: ctx.restaurantId,
    restaurantName: ctx.restaurantName,
    logoUrl: ctx.logoUrl,
    loading: ctx.loading,
  };
}

export function useUserRole() {
  const ctx = useRestaurantAndRole();
  return {
    role: ctx.role,
    loading: ctx.loading,
    restaurantId: ctx.restaurantId,
    hasRole: ctx.hasRole,
    isManager: ctx.isManager,
    isOps: ctx.isOps,
    isCounter: ctx.isCounter,
    isServer: ctx.isServer,
    isInvestor: ctx.isInvestor,
    canViewReports: ctx.canViewReports,
  };
}

export function useAuth() {
  const ctx = useRestaurantAndRole();
  return {
    user: ctx.user,
    session: null, // not needed in this app
    loading: ctx.authLoading,
  };
}
