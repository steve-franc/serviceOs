import { Link, useParams } from "react-router-dom";
import { StatCard } from "@/components/superadmin/StatCard";
import { StatusBadge } from "@/components/superadmin/StatusBadge";
import { useSuperRestaurantDetail, useSubscriptionTiers, useAssignRestaurantTier } from "@/hooks/useSuperadminData";
import { ArrowLeft, ShoppingCart, DollarSign, Users, Package, Trash2, Menu as MenuIcon, ExternalLink, CreditCard, Infinity as InfinityIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { FEATURE_LABELS } from "@/lib/feature-catalog";

const PRESET_LABELS = FEATURE_LABELS;

function renderFeatureValue(v: any) {
  if (v === null || v === undefined || v === "") {
    return (
      <span className="inline-flex items-center gap-1 text-primary font-medium">
        <InfinityIcon className="h-3.5 w-3.5" /> Unlimited
      </span>
    );
  }
  if (typeof v === "boolean") return v ? "On" : "Off";
  return String(v);
}

const ROLES = ["manager", "ops", "counter", "server", "investor"] as const;

function StaffRow({ staff, restaurantId, onChange }: { staff: any; restaurantId: string; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const change = async (role: string) => {
    setBusy(true);
    const { error } = await supabase.rpc("superadmin_change_role", { _user_id: staff.user_id, _restaurant_id: restaurantId, _role: role });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Role updated"); onChange();
  };
  const remove = async () => {
    if (!confirm(`Remove ${staff.full_name || "staff"}?`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("superadmin_remove_staff", { _user_id: staff.user_id, _restaurant_id: restaurantId });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Removed"); onChange();
  };
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{staff.full_name || "—"}</div>
        <div className="text-xs text-muted-foreground font-mono truncate">{staff.user_id}</div>
      </div>
      <Select value={staff.role || ""} onValueChange={change} disabled={busy}>
        <SelectTrigger className="w-32 h-8"><SelectValue placeholder="Role" /></SelectTrigger>
        <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" variant="ghost" className="text-destructive" onClick={remove} disabled={busy}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SubscriptionCard({ restaurant, onChanged }: { restaurant: any; onChanged: () => void }) {
  const { data: tiers } = useSubscriptionTiers();
  const assign = useAssignRestaurantTier();
  const currentTier = (tiers ?? []).find((t: any) => t.id === restaurant.tier_id);
  const features = (currentTier?.features ?? {}) as Record<string, any>;
  const entries = Object.entries(features);

  const onChange = async (tierId: string) => {
    try {
      await assign.mutateAsync({ restaurant_id: restaurant.id, tier_id: tierId });
      toast.success("Subscription updated");
      onChanged();
    } catch (err: any) {
      toast.error(err?.message || "Failed to change tier");
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Subscription</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Tier:</span>
          <Select value={restaurant.tier_id ?? ""} onValueChange={onChange} disabled={assign.isPending}>
            <SelectTrigger className="w-44 h-8">
              <SelectValue placeholder="Select tier" />
            </SelectTrigger>
            <SelectContent>
              {(tiers ?? []).map((t: any) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} {t.is_free ? "· Free" : `· ${formatPrice(Number(t.price_try ?? 0), "TRY")}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {entries.length === 0 && (
          <p className="text-xs text-muted-foreground italic col-span-full">No limits — fully unlimited.</p>
        )}
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground truncate">{PRESET_LABELS[k] ?? k}</span>
            <span className="font-mono text-xs">{renderFeatureValue(v)}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default function SuperRestaurantDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, refetch } = useSuperRestaurantDetail(id);
  const qc = useQueryClient();

  if (isLoading) {
    return <><div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4"><Skeleton className="h-8 w-48" /><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div></div></>;
  }
  if (!data?.restaurant) {
    return <><div className="max-w-7xl mx-auto p-6"><p className="text-muted-foreground">Business not found.</p></div></>;
  }

  const r = data.restaurant;
  const t = data.totals || {};

  return (
    <>
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div>
          <Link to="/superadmin/restaurants" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Businesses
          </Link>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{r.name}</h1>
              <p className="text-sm text-muted-foreground mt-0.5 capitalize">{(r.business_type || "restaurant").replace("_", " ")} · Created {new Date(r.created_at).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link to={`/superadmin/restaurants/${r.id}/menu`}>
                <Button size="sm" variant="outline" className="gap-1.5"><MenuIcon className="h-4 w-4" /> View Menu</Button>
              </Link>
              <StatusBadge status={r.status} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Revenue" value={formatPrice(Number(t.revenue ?? 0))} icon={<DollarSign className="h-4 w-4" />} />
          <StatCard label="Total Orders" value={Number(t.orders ?? 0).toLocaleString()} icon={<ShoppingCart className="h-4 w-4" />} />
          <StatCard label="Staff" value={String(data.staff?.length ?? 0)} icon={<Users className="h-4 w-4" />} />
          <StatCard label="Menu Items" value={String(t.menu_items ?? 0)} sub={`${t.inventory_items ?? 0} inventory`} icon={<Package className="h-4 w-4" />} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Open Tabs" value={String(t.open_tabs ?? 0)} />
          <StatCard label="Unresolved Debt" value={formatPrice(Number(t.unresolved_debt ?? 0))} />
          <StatCard label="Staff Count" value={String(data.staff?.length ?? 0)} />
        </div>

        <SubscriptionCard restaurant={r} onChanged={() => { refetch(); qc.invalidateQueries({ queryKey: ["super"] }); }} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold">Staff ({data.staff?.length ?? 0})</h2>
            </div>
            <div>
              {(data.staff || []).map((s: any) => (
                <StaffRow key={s.user_id} staff={s} restaurantId={r.id} onChange={() => { refetch(); qc.invalidateQueries({ queryKey: ["super"] }); }} />
              ))}
              {(!data.staff || data.staff.length === 0) && <div className="px-5 py-8 text-center text-sm text-muted-foreground">No staff yet</div>}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">Recent Orders</h2>
            </div>
            <div className="divide-y divide-border">
              {(data.recent_orders || []).slice(0, 10).map((o: any) => (
                <Link key={o.id} to={`/receipt/${o.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-accent/50 transition-colors">
                  <div>
                    <p className="text-sm font-medium font-mono">#{o.order_number}</p>
                    <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium font-mono">{formatPrice(Number(o.total))}</span>
                    <StatusBadge status={o.status} />
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </Link>
              ))}
              {(!data.recent_orders || data.recent_orders.length === 0) && <div className="px-5 py-8 text-center text-sm text-muted-foreground">No orders yet</div>}
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
}
