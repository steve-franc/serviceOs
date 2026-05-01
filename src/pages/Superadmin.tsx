import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Pause, Play, Archive, Trash2, Eye, Search, Shield } from "lucide-react";
import { formatPrice } from "@/lib/currency";

type RestaurantRow = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  staff_count: number;
  orders_count: number;
  revenue: number;
  last_order_at: string | null;
  logo_url: string | null;
};

type Overview = {
  restaurants_total: number;
  restaurants_active: number;
  restaurants_on_hold: number;
  restaurants_archived: number;
  users_total: number;
  orders_today: number;
  revenue_today: number;
  orders_total: number;
  revenue_total: number;
};

const statusBadge = (status: string) => {
  if (status === "active") return <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-0">Active</Badge>;
  if (status === "on_hold") return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0">On hold</Badge>;
  return <Badge className="bg-muted text-muted-foreground border-0">Archived</Badge>;
};

const Superadmin = () => {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [purgeTarget, setPurgeTarget] = useState<RestaurantRow | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: ov }, { data: rs, error }] = await Promise.all([
      supabase.rpc("superadmin_overview"),
      supabase.rpc("superadmin_list_restaurants"),
    ]);
    if (error) toast.error(error.message);
    setOverview(ov as any);
    setRestaurants((rs as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!detailId) { setDetail(null); return; }
    (async () => {
      const { data, error } = await supabase.rpc("superadmin_get_restaurant", { _restaurant_id: detailId });
      if (error) { toast.error(error.message); return; }
      setDetail(data);
    })();
  }, [detailId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return restaurants;
    return restaurants.filter((r) => r.name.toLowerCase().includes(q));
  }, [restaurants, search]);

  const setStatus = async (r: RestaurantRow, status: string) => {
    setBusyId(r.id);
    const { error } = await supabase.rpc("superadmin_set_restaurant_status", {
      _restaurant_id: r.id, _status: status,
    });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Restaurant marked ${status.replace("_", " ")}`);
    load();
  };

  const purge = async () => {
    if (!purgeTarget) return;
    if (purgeConfirm !== purgeTarget.name) {
      toast.error("Type the restaurant name exactly to confirm");
      return;
    }
    setBusyId(purgeTarget.id);
    const { error } = await supabase.rpc("superadmin_purge_restaurant", { _restaurant_id: purgeTarget.id });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Restaurant permanently deleted");
    setPurgeTarget(null);
    setPurgeConfirm("");
    load();
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Shield className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">God Mode</h1>
            <p className="text-sm text-muted-foreground">Platform-wide oversight & controls</p>
          </div>
        </div>

        {/* Overview cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Restaurants" value={overview?.restaurants_total ?? "—"} sub={`${overview?.restaurants_active ?? 0} active`} />
          <StatCard label="On hold / Archived" value={`${overview?.restaurants_on_hold ?? 0} / ${overview?.restaurants_archived ?? 0}`} />
          <StatCard label="Total users" value={overview?.users_total ?? "—"} />
          <StatCard label="Orders today" value={overview?.orders_today ?? "—"} sub={overview ? formatPrice(overview.revenue_today) : ""} />
          <StatCard label="All-time orders" value={overview?.orders_total ?? "—"} />
          <StatCard label="All-time revenue" value={overview ? formatPrice(overview.revenue_total) : "—"} />
        </div>

        {/* Restaurants table */}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>Restaurants</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="pl-8"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Staff</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead>Last activity</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell className="text-right">{r.staff_count}</TableCell>
                        <TableCell className="text-right">{r.orders_count}</TableCell>
                        <TableCell className="text-right font-mono">{formatPrice(Number(r.revenue || 0))}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {r.last_order_at ? new Date(r.last_order_at).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setDetailId(r.id)} title="View">
                              <Eye className="h-4 w-4" />
                            </Button>
                            {r.status === "active" && (
                              <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => setStatus(r, "on_hold")} title="Put on hold">
                                <Pause className="h-4 w-4" />
                              </Button>
                            )}
                            {r.status === "on_hold" && (
                              <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => setStatus(r, "active")} title="Resume">
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            {r.status !== "archived" && (
                              <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => setStatus(r, "archived")} title="Archive">
                                <Archive className="h-4 w-4" />
                              </Button>
                            )}
                            {r.status === "archived" && (
                              <>
                                <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => setStatus(r, "active")} title="Restore">
                                  <Play className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-destructive" disabled={busyId === r.id} onClick={() => setPurgeTarget(r)} title="Purge">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filtered.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No restaurants found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detailId} onOpenChange={(o) => { if (!o) setDetailId(null); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.restaurant?.name ?? "Restaurant"}</DialogTitle>
            <DialogDescription>
              Status: {detail?.restaurant?.status} · Created {detail?.restaurant?.created_at ? new Date(detail.restaurant.created_at).toLocaleDateString() : ""}
            </DialogDescription>
          </DialogHeader>
          {!detail ? (
            <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading…</div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <Mini label="Orders" value={detail.totals?.orders ?? 0} />
                <Mini label="Revenue" value={formatPrice(Number(detail.totals?.revenue ?? 0))} />
                <Mini label="Menu items" value={detail.totals?.menu_items ?? 0} />
                <Mini label="Inventory" value={detail.totals?.inventory_items ?? 0} />
                <Mini label="Open tabs" value={detail.totals?.open_tabs ?? 0} />
                <Mini label="Unresolved debt" value={formatPrice(Number(detail.totals?.unresolved_debt ?? 0))} />
              </div>

              <div>
                <h3 className="font-semibold mb-2">Staff ({detail.staff?.length ?? 0})</h3>
                <div className="rounded-md border divide-y">
                  {(detail.staff || []).map((s: any) => (
                    <StaffRow key={s.user_id} staff={s} restaurantId={detail.restaurant.id} onChange={() => setDetailId(detail.restaurant.id)} />
                  ))}
                  {(!detail.staff || detail.staff.length === 0) && (
                    <div className="p-3 text-sm text-muted-foreground">No staff yet</div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Recent orders</h3>
                <div className="rounded-md border divide-y text-sm">
                  {(detail.recent_orders || []).slice(0, 10).map((o: any) => (
                    <div key={o.id} className="flex items-center justify-between p-2">
                      <span className="font-mono">#{o.order_number}</span>
                      <span className="text-muted-foreground">{new Date(o.created_at).toLocaleString()}</span>
                      <span className="font-mono">{formatPrice(Number(o.total))}</span>
                    </div>
                  ))}
                  {(!detail.recent_orders || detail.recent_orders.length === 0) && (
                    <div className="p-3 text-muted-foreground">No orders yet</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Purge confirm */}
      <Dialog open={!!purgeTarget} onOpenChange={(o) => { if (!o) { setPurgeTarget(null); setPurgeConfirm(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Permanently delete restaurant?</DialogTitle>
            <DialogDescription>
              This will delete <strong>{purgeTarget?.name}</strong> and all its orders, menu, staff links, inventory, expenses, and reports. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">Type <strong>{purgeTarget?.name}</strong> to confirm:</p>
            <Input value={purgeConfirm} onChange={(e) => setPurgeConfirm(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPurgeTarget(null); setPurgeConfirm(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={purge} disabled={busyId === purgeTarget?.id || purgeConfirm !== purgeTarget?.name}>
              {busyId === purgeTarget?.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

const StatCard = ({ label, value, sub }: { label: string; value: any; sub?: string }) => (
  <Card>
    <CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
      {sub ? <div className="text-xs text-muted-foreground mt-0.5">{sub}</div> : null}
    </CardContent>
  </Card>
);

const Mini = ({ label, value }: { label: string; value: any }) => (
  <div className="rounded-md border p-2">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-sm font-semibold font-mono">{value}</div>
  </div>
);

const ROLE_OPTIONS = ["manager", "ops", "counter", "server", "investor"] as const;

const StaffRow = ({ staff, restaurantId, onChange }: { staff: any; restaurantId: string; onChange: () => void }) => {
  const [busy, setBusy] = useState(false);

  const change = async (role: string) => {
    setBusy(true);
    const { error } = await supabase.rpc("superadmin_change_role", {
      _user_id: staff.user_id, _restaurant_id: restaurantId, _role: role,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Role updated");
    onChange();
  };

  const remove = async () => {
    if (!confirm(`Remove ${staff.full_name || "staff"} from this restaurant?`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("superadmin_remove_staff", {
      _user_id: staff.user_id, _restaurant_id: restaurantId,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed");
    onChange();
  };

  return (
    <div className="flex items-center gap-2 p-2">
      <div className="flex-1 text-sm">
        <div className="font-medium">{staff.full_name || "—"}</div>
        <div className="text-xs text-muted-foreground font-mono">{staff.user_id}</div>
      </div>
      <Select value={staff.role || ""} onValueChange={change} disabled={busy}>
        <SelectTrigger className="w-32 h-8"><SelectValue placeholder="Role" /></SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((r) => (
            <SelectItem key={r} value={r}>{r}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="ghost" className="text-destructive" onClick={remove} disabled={busy}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default Superadmin;
