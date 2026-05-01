import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { StatusBadge } from "@/components/superadmin/StatusBadge";
import { useSuperRestaurants } from "@/hooks/useSuperadminData";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Pause, Play, Archive, Trash2 } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

export default function SuperRestaurants() {
  const { data: restaurants, isLoading } = useSuperRestaurants();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<any>(null);
  const [purgeConfirm, setPurgeConfirm] = useState("");
  const qc = useQueryClient();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return restaurants ?? [];
    return (restaurants ?? []).filter((r: any) => r.name.toLowerCase().includes(q));
  }, [restaurants, search]);

  const setStatus = async (r: any, status: string) => {
    setBusyId(r.id);
    const { error } = await supabase.rpc("superadmin_set_restaurant_status", { _restaurant_id: r.id, _status: status });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${status.replace("_", " ")}`);
    qc.invalidateQueries({ queryKey: ["super"] });
  };

  const purge = async () => {
    if (!purgeTarget) return;
    if (purgeConfirm !== purgeTarget.name) return toast.error("Type the name exactly");
    setBusyId(purgeTarget.id);
    const { error } = await supabase.rpc("superadmin_purge_restaurant", { _restaurant_id: purgeTarget.id });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success("Restaurant permanently deleted");
    setPurgeTarget(null); setPurgeConfirm("");
    qc.invalidateQueries({ queryKey: ["super"] });
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Restaurants</h1>
            <p className="text-sm text-muted-foreground">{restaurants?.length ?? 0} total</p>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-8" />
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-5 py-3 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span>Name</span><span>Staff</span><span>Orders</span><span>Revenue</span><span>Status</span><span>Actions</span>
          </div>
          {isLoading ? (
            <div className="p-3 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">No restaurants found</div>
          ) : (
            filtered.map((r: any, i: number) => (
              <motion.div key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto_auto_auto] gap-1 md:gap-4 items-center px-5 py-4 border-b border-border last:border-b-0 hover:bg-accent/50 transition-colors">
                <Link to={`/superadmin/restaurants/${r.id}`} className="block min-w-0">
                  <p className="font-medium text-sm truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground md:hidden">{r.orders_count} orders · {formatPrice(Number(r.revenue || 0))}</p>
                </Link>
                <span className="hidden md:block text-sm text-muted-foreground">{r.staff_count}</span>
                <span className="hidden md:block text-sm text-muted-foreground">{r.orders_count}</span>
                <span className="hidden md:block text-sm font-medium font-mono">{formatPrice(Number(r.revenue || 0))}</span>
                <div><StatusBadge status={r.status} /></div>
                <div className="flex gap-1 justify-end">
                  {r.status === "active" && <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => setStatus(r, "on_hold")} title="Hold"><Pause className="h-4 w-4" /></Button>}
                  {r.status === "on_hold" && <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => setStatus(r, "active")} title="Resume"><Play className="h-4 w-4" /></Button>}
                  {r.status !== "archived" && <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => setStatus(r, "archived")} title="Archive"><Archive className="h-4 w-4" /></Button>}
                  {r.status === "archived" && (
                    <>
                      <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => setStatus(r, "active")} title="Restore"><Play className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive" disabled={busyId === r.id} onClick={() => setPurgeTarget(r)} title="Purge"><Trash2 className="h-4 w-4" /></Button>
                    </>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      <Dialog open={!!purgeTarget} onOpenChange={(o) => { if (!o) { setPurgeTarget(null); setPurgeConfirm(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Permanently delete restaurant?</DialogTitle>
            <DialogDescription>
              This will delete <strong>{purgeTarget?.name}</strong> and ALL its data. Cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">Type <strong>{purgeTarget?.name}</strong> to confirm:</p>
            <Input value={purgeConfirm} onChange={(e) => setPurgeConfirm(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPurgeTarget(null); setPurgeConfirm(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={purge} disabled={busyId === purgeTarget?.id || purgeConfirm !== purgeTarget?.name}>Delete forever</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
