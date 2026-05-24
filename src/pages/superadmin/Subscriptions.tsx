import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, Infinity as InfinityIcon } from "lucide-react";
import { useSubscriptionTiers, useDeleteTier } from "@/hooks/useSuperadminData";
import { TierEditDialog } from "@/components/superadmin/TierEditDialog";
import { formatPrice } from "@/lib/currency";
import { toast } from "sonner";

import { FEATURE_LABELS } from "@/lib/feature-catalog";

const PRESET_LABELS = FEATURE_LABELS;

function renderValue(v: any) {
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

export default function Subscriptions() {
  const { data: tiers, isLoading } = useSubscriptionTiers();
  const del = useDeleteTier();
  const [editing, setEditing] = useState<any | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (t: any) => {
    setEditing(t);
    setDialogOpen(true);
  };

  const onDelete = async (t: any) => {
    if (!confirm(`Delete tier "${t.name}"?`)) return;
    try {
      await del.mutateAsync(t.id);
      toast.success("Tier deleted");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete tier");
    }
  };

  return (
    <>
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Subscription Tiers</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Edit limits and features for each plan.</p>
          </div>
          <Button onClick={openNew} className="gap-1.5">
            <Plus className="h-4 w-4" /> New tier
          </Button>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(tiers ?? []).map((t: any) => {
              const features = (t.features ?? {}) as Record<string, any>;
              const entries = Object.entries(features);
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl bg-card border border-border shadow-sm overflow-hidden flex flex-col"
                >
                  <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-semibold truncate">{t.name}</h2>
                        {t.is_free && <Badge variant="outline">Free</Badge>}
                        {!t.is_active && <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{t.slug}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-semibold font-mono">{formatPrice(Number(t.price_try ?? 0), "TRY")}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">/ month</p>
                    </div>
                  </div>

                  <div className="px-5 py-3 flex-1 space-y-1.5">
                    {entries.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No limits set — fully unlimited.</p>
                    )}
                    {entries.map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground truncate">
                          {PRESET_LABELS[k] ?? k}
                        </span>
                        <span className="font-mono text-xs">{renderValue(v)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="px-3 py-2 border-t border-border flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(t)} className="gap-1">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(t)}
                      className="text-destructive gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                </motion.div>
              );
            })}
            {(tiers ?? []).length === 0 && (
              <div className="col-span-full rounded-xl bg-card border border-border p-12 text-center text-sm text-muted-foreground">
                No tiers yet
              </div>
            )}
          </div>
        )}
      </div>

      <TierEditDialog open={dialogOpen} onOpenChange={setDialogOpen} tier={editing} />
    </>
  );
}
