import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RestaurantInfo {
  id: string;
  name: string;
}

/**
 * Loads the current user's restaurant membership (one restaurant per user).
 * Also performs onboarding: if the user has a restaurant in auth metadata,
 * it will create the membership (and optionally create the restaurant) once.
 */
export function useRestaurantContext() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const ensureMembershipFromMetadata = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      if (!user) {
        if (!cancelled) {
          setRestaurantId(null);
          setRestaurantName(null);
          setLoading(false);
        }
        return;
      }

      // 1) Load membership
      const { data: membership, error: membershipError } = await supabase
        .from("restaurant_memberships")
        .select("restaurant_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (membershipError) throw membershipError;

      // 2) If missing, try to create from signup metadata
      if (!membership?.restaurant_id) {
        const meta: any = user.user_metadata || {};
        const onboardingMode = meta.onboarding_mode as string | undefined;

        if (onboardingMode === "join" && meta.join_restaurant_id) {
          const joinRestaurantId = String(meta.join_restaurant_id);
          const { error } = await supabase.from("restaurant_memberships").insert({
            user_id: user.id,
            restaurant_id: joinRestaurantId,
          });
          if (error) throw error;
          if (cancelled) return;
          setRestaurantId(joinRestaurantId);
        }

        if (onboardingMode === "create" && meta.create_restaurant_name) {
          const restaurantName = String(meta.create_restaurant_name);

          const { data: createdRestaurant, error: createError } = await supabase
            .from("restaurants")
            .insert({ name: restaurantName, created_by: user.id })
            .select("id, name")
            .single();
          if (createError) throw createError;

          const { error: membershipInsertError } = await supabase.from("restaurant_memberships").insert({
            user_id: user.id,
            restaurant_id: createdRestaurant.id,
          });
          if (membershipInsertError) throw membershipInsertError;

          // Make the creator the manager of their restaurant
          const { error: roleError } = await supabase.from("user_roles").insert({
            user_id: user.id,
            role: "manager",
            restaurant_id: createdRestaurant.id,
          });
          if (roleError) throw roleError;

          if (cancelled) return;
          setRestaurantId(createdRestaurant.id);
          setRestaurantName(createdRestaurant.name);
        }
      } else {
        if (cancelled) return;
        setRestaurantId(membership.restaurant_id);
      }

      // 3) Load restaurant name if we have an id
      const rid = membership?.restaurant_id ?? restaurantId;
      const finalRid = rid ?? null;
      if (!finalRid) {
        if (!cancelled) {
          setRestaurantName(null);
          setLoading(false);
        }
        return;
      }

      const { data: r, error: rError } = await supabase
        .from("restaurants")
        .select("id, name")
        .eq("id", finalRid)
        .maybeSingle();
      if (rError) throw rError;

      if (!cancelled) {
        setRestaurantName(r?.name ?? null);
        setLoading(false);
      }
    };

    // Avoid doing supabase calls inside onAuthStateChange callback.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        ensureMembershipFromMetadata().catch(() => {
          if (!cancelled) setLoading(false);
        });
      }, 0);
    });

    ensureMembershipFromMetadata().catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { restaurantId, restaurantName, loading };
}
