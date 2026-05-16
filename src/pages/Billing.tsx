import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, CreditCard, Loader2, Infinity as InfinityIcon } from "lucide-react";
import { DodoPayments } from "dodopayments-checkout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantAndRole } from "@/hooks/useRestaurantAndRole";
import { formatPrice } from "@/lib/currency";
import { FEATURE_LABELS } from "@/lib/feature-catalog";
import { toast } from "sonner";

function renderValue(v: any) {
  if (v === null || v === undefined || v === "") {
    return (
      <span className="inline-flex items-center gap-1 text-primary font-medium">
        <InfinityIcon className="h-3.5 w-3.5" /> Unlimited
      </span>
    );
  }
  if (typeof v === "boolean") return v ? "Included" : "Not included";
  return String(v);
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  on_hold: { label: "On hold", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  failed: { label: "Failed", cls: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground" },
  free: { label: "Free plan", cls: "bg-muted text-muted-foreground" },
};

export default function Billing() {
  const { restaurantId, isManager, loading: roleLoading } = useRestaurantAndRole();
  const [loadingTierId, setLoadingTierId] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  const { data: tiers, isLoading: tiersLoading } = useQuery({
    queryKey: ["billing", "tiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_tiers")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: restaurant, refetch: refetchRestaurant } = useQuery({
    queryKey: ["billing", "restaurant", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, tier_id, subscription_status, current_period_end, dodo_subscription_id")
        .eq("id", restaurantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["billing", "platform-mode"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("payment_mode").eq("id", true).maybeSingle();
      return data;
    },
  });

  const mode = (settings?.payment_mode === "live" ? "live" : "test") as "live" | "test";

  useEffect(() => {
    try {
      DodoPayments.Initialize({
        mode,
        displayType: "overlay",
        onEvent: (event: any) => {
          if (event.event_type === "checkout.opened") setLoadingTierId(null);
          if (event.event_type === "checkout.closed") {
            // Refresh restaurant state — webhook may have updated it
            setTimeout(() => refetchRestaurant(), 1500);
          }
          if (event.event_type === "checkout.error") {
            setLoadingTierId(null);
            toast.error(event.data?.message || "Checkout error");
          }
        },
      });
      setSdkReady(true);
    } catch (err) {
      console.error("Dodo SDK init failed", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleSubscribe = async (tierId: string) => {
    if (!sdkReady) return;
    setLoadingTierId(tierId);
    try {
      const { data, error } = await supabase.functions.invoke("dodo-checkout", {
        body: { tier_id: tierId, return_url: `${window.location.origin}/billing?success=1` },
      });
      if (error) throw error;
      if (!data?.checkout_url) throw new Error("No checkout URL returned");
      await DodoPayments.Checkout.open({ checkoutUrl: data.checkout_url });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to start checkout");
      setLoadingTierId(null);
    }
  };

  if (roleLoading || tiersLoading) {
    return (
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <Skeleton className="h-9 w-48" />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!isManager) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold">Only managers can manage billing</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Ask your restaurant manager to upgrade or change the plan.
        </p>
      </div>
    );
  }

  const currentTierId = restaurant?.tier_id;
  const status = restaurant?.subscription_status || "free";
  const statusInfo = STATUS_LABEL[status] || STATUS_LABEL.free;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing & Plans</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Choose a plan to unlock more for your business.
            {mode === "test" && (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-500/15 text-amber-700 dark:text-amber-300">
                Test mode
              </span>
            )}
          </p>
        </div>
        <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${statusInfo.cls}`}>
          {statusInfo.label}
          {restaurant?.current_period_end && status === "active" && (
            <span className="ml-2 opacity-70">
              · renews {new Date(restaurant.current_period_end).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(tiers ?? []).map((t: any) => {
          const features = (t.features ?? {}) as Record<string, any>;
          const entries = Object.entries(features);
          const isCurrent = currentTierId === t.id && (status === "active" || (status === "free" && t.is_free));
          const productConfigured = !!(mode === "live" ? t.dodo_price_id_live : t.dodo_price_id_test);
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl bg-card border shadow-sm overflow-hidden flex flex-col ${
                isCurrent ? "border-primary ring-2 ring-primary/20" : "border-border"
              }`}
            >
              <div className="px-5 py-4 border-b border-border">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-semibold truncate">{t.name}</h2>
                      {t.is_free && <Badge variant="outline">Free</Badge>}
                      {isCurrent && <Badge className="bg-primary text-primary-foreground">Current</Badge>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-semibold font-mono">{formatPrice(Number(t.price_try ?? 0))}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">/ month</p>
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 flex-1 space-y-1.5">
                {entries.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">Fully unlimited.</p>
                )}
                {entries.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground truncate flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-primary" />
                      {FEATURE_LABELS[k] ?? k}
                    </span>
                    <span className="font-mono text-xs">{renderValue(v)}</span>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 border-t border-border">
                {t.is_free ? (
                  <Button variant="outline" disabled className="w-full">
                    {isCurrent ? "Your current plan" : "Free tier"}
                  </Button>
                ) : isCurrent ? (
                  <Button variant="outline" disabled className="w-full">
                    Active
                  </Button>
                ) : !productConfigured ? (
                  <Button variant="outline" disabled className="w-full" title="Set Dodo product ID in superadmin">
                    Not available
                  </Button>
                ) : (
                  <Button
                    className="w-full gap-1.5"
                    onClick={() => handleSubscribe(t.id)}
                    disabled={loadingTierId === t.id}
                  >
                    {loadingTierId === t.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Opening…
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4" />
                        {currentTierId ? "Switch to this plan" : "Subscribe"}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </motion.div>
          );
        })}
        {(tiers ?? []).length === 0 && (
          <div className="col-span-full rounded-xl bg-card border border-border p-12 text-center text-sm text-muted-foreground">
            No plans available yet
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center pt-4">
        Payments are processed securely by Dodo Payments. You can cancel anytime.
      </p>
    </div>
  );
}
