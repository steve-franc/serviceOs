import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyBrandTheme, clearBrandTheme } from "@/lib/brand-theme";

// Fetches the brand colors for the given restaurant and applies them as CSS variables.
// Pass `null` to clear (e.g. when leaving a public page).
export function useBrandTheme(restaurantId: string | null | undefined) {
  useEffect(() => {
    let cancelled = false;
    if (!restaurantId) {
      clearBrandTheme();
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("restaurant_settings")
        .select("brand_primary, brand_accent")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      if (cancelled) return;
      applyBrandTheme(
        (data as any)?.brand_primary ?? null,
        (data as any)?.brand_accent ?? null
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);
}
