import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type UserRole = "server" | "ops" | "counter" | "manager" | "investor" | "superadmin" | null;

const GOD_MODE_OFF_KEY = "god_mode_off";

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
  /** True when the signed-in user is globally a superadmin (regardless of mode toggle) */
  isSuperadminAccount: boolean;
  /** When true, superadmin is acting as their assigned restaurant role */
  godModeDisabled: boolean;
  setGodModeDisabled: (off: boolean) => void;
  /** True when role can view reports/admin (manager OR investor) */
  canViewReports: boolean;
}

const RestaurantRoleContext = createContext<RestaurantRoleState>({
  user: null,
  restaurantId: null,
  restaurantName: null,
  restaurantStatus: null,
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
  isSuperadmin: false,
  isSuperadminAccount: false,
  godModeDisabled: false,
  setGodModeDisabled: () => {},
  canViewReports: false,
});

export function RestaurantRoleProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [restaurantStatus, setRestaurantStatus] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [isSuperadminAccount, setIsSuperadminAccount] = useState(false);
  const [godModeDisabled, setGodModeDisabledState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(GOD_MODE_OFF_KEY) === "1";
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  const setGodModeDisabled = (off: boolean) => {
    if (typeof window !== "undefined") {
      if (off) window.localStorage.setItem(GOD_MODE_OFF_KEY, "1");
      else window.localStorage.removeItem(GOD_MODE_OFF_KEY);
    }
    setGodModeDisabledState(off);
  };

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
          setRestaurantStatus(null);
          setLogoUrl(null);
          setRole(null);
          setLoading(false);
          return;
        }

        setLoading(true);

        // 0) Check superadmin first (global, no restaurant)
        const { data: superRow } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", currentUser.id)
          .eq("role", "superadmin")
          .maybeSingle();

        if (cancelled) return;

        const isSuper = !!superRow;
        setIsSuperadminAccount(isSuper);

        if (isSuper && !godModeDisabled) {
          setRole("superadmin");
          setRestaurantId(null);
          setRestaurantName(null);
          setRestaurantStatus(null);
          setLogoUrl(null);
          setLoading(false);
          return;
        }

        // 1) Load membership (also for superadmins acting in normal mode)
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
            const businessType = meta.business_type ? String(meta.business_type) : "restaurant";
            const { data: created } = await supabase
              .from("restaurants")
              .insert({ name, created_by: currentUser.id, business_type: businessType } as any)
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
          const [restaurantRes, roleRes, settingsRes] = await Promise.all([
            supabase.from("restaurants").select("name, status").eq("id", rid).maybeSingle(),
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
          setRestaurantStatus((restaurantRes.data as any)?.status ?? null);
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
  }, [godModeDisabled]);

  const isManager = role === "manager";
  const isInvestor = role === "investor";
  const isSuperadmin = role === "superadmin";

  const value: RestaurantRoleState = {
    user,
    restaurantId,
    restaurantName,
    restaurantStatus,
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
    isSuperadmin,
    isSuperadminAccount,
    godModeDisabled,
    setGodModeDisabled,
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
    isSuperadmin: ctx.isSuperadmin,
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
