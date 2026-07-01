import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Check, X, Users, AlertCircle, Pencil, Search, Receipt as ReceiptIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { formatPrice } from "@/lib/currency";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Debtor {
  id: string;
  restaurant_id: string;
  customer_name: string;
  amount_owed: number;
  currency: string;
  notes: string | null;
  staff_id: string;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
  source_order_id?: string | null;
}

const Debtors = () => {
  const { restaurantId, loading: restaurantLoading } = useRestaurantContext();
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDebtor, setEditingDebtor] = useState<Debtor | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unpaid" | "paid">("all");
  const [ordersDialogOpen, setOrdersDialogOpen] = useState(false);
  const [ordersDialogDebtor, setOrdersDialogDebtor] = useState<Debtor | null>(null);
  const [ordersDialogLoading, setOrdersDialogLoading] = useState(false);
  const [ordersDialogData, setOrdersDialogData] = useState<any[]>([]);

  const openOrdersDialog = async (debtor: Debtor) => {
    setOrdersDialogDebtor(debtor);
    setOrdersDialogOpen(true);
    setOrdersDialogLoading(true);
    setOrdersDialogData([]);
    try {
      const orFilter = debtor.source_order_id
        ? `id.eq.${debtor.source_order_id},paid_via_debtor_id.eq.${debtor.id}`
        : `paid_via_debtor_id.eq.${debtor.id}`;
      const { data: orders } = await supabase
        .from("orders")
        .select("id, order_number, total, created_at, payment_status, customer_name, notes")
        .or(orFilter)
        .order("created_at", { ascending: false });
      const ids = (orders || []).map((o: any) => o.id);
      let itemsByOrder: Record<string, any[]> = {};
      if (ids.length > 0) {
        const { data: items } = await supabase
          .from("order_items")
          .select("order_id, menu_item_name, quantity, price_at_time, subtotal")
          .in("order_id", ids);
        (items || []).forEach((it: any) => {
          (itemsByOrder[it.order_id] ||= []).push(it);
        });
      }
      setOrdersDialogData((orders || []).map((o: any) => ({ ...o, items: itemsByOrder[o.id] || [] })));
    } catch {
      toast.error("Failed to load orders");
    } finally {
      setOrdersDialogLoading(false);
    }
  };

  useEffect(() => {
    if (restaurantId) fetchDebtors();
  }, [restaurantId]);


  const fetchDebtors = async () => {
    if (!restaurantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("debtors")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("is_resolved", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) toast.error("Failed to load debtors");
    setDebtors(data || []);
    setLoading(false);
  };

  const openCreate = () => {
    setEditingDebtor(null);
    setName("");
    setAmount("");
    setNotes("");
    setDialogOpen(true);
  };

  const openEdit = (debtor: Debtor) => {
    setEditingDebtor(debtor);
    setName(debtor.customer_name);
    setAmount(debtor.amount_owed.toString());
    setNotes(debtor.notes || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!restaurantId || !name.trim() || !amount) return;
    setSaving(true);
    try {
      if (editingDebtor) {
        const { error } = await supabase
          .from("debtors")
          .update({
            customer_name: name.trim(),
            amount_owed: parseFloat(amount),
            notes: notes.trim() || null,
          })
          .eq("id", editingDebtor.id);
        if (error) throw error;
        toast.success("Debtor updated");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const { error } = await supabase.from("debtors").insert({
          restaurant_id: restaurantId,
          customer_name: name.trim(),
          amount_owed: parseFloat(amount),
          notes: notes.trim() || null,
          staff_id: user.id,
        });
        if (error) throw error;
        toast.success("Debtor added");
      }
      setDialogOpen(false);
      setEditingDebtor(null);
      setName("");
      setAmount("");
      setNotes("");
      fetchDebtors();
    } catch (err: any) {
      toast.error(err.message || "Failed to save debtor");
    } finally {
      setSaving(false);
    }
  };

  const toggleResolved = async (debtor: Debtor) => {
    const newResolved = !debtor.is_resolved;
    const { error } = await supabase
      .from("debtors")
      .update({
        is_resolved: newResolved,
        resolved_at: newResolved ? new Date().toISOString() : null,
      })
      .eq("id", debtor.id);
    if (error) {
      toast.error("Failed to update");
      return;
    }

    // If this debt came from an unpaid order, flip the original order's status
    // (without bubbling it into today's pool — the synthetic settlement order
    // below handles that).
    if (debtor.source_order_id) {
      const { error: orderErr } = await supabase
        .from("orders")
        .update({
          payment_status: newResolved ? "paid" : "unpaid",
          paid_via_debtor_id: newResolved ? debtor.id : null,
        } as any)
        .eq("id", debtor.source_order_id);
      if (orderErr) {
        toast.error("Debt updated but order status sync failed");
      }
    }

    // On resolve, always record a synthetic "Debt Settlement" order dated today
    // so the paid amount lands in the current day's pool.
    if (newResolved) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && restaurantId) {
          const { data: num } = await supabase.rpc("get_next_order_number", { _restaurant_id: restaurantId });
          await supabase.from("orders").insert({
            restaurant_id: restaurantId,
            staff_id: user.id,
            total: Number(debtor.amount_owed),
            payment_method: "Debt Settlement",
            payment_status: "paid",
            status: "confirmed",
            currency: debtor.currency || "TRY",
            customer_name: debtor.customer_name,
            notes: `Debt settlement${debtor.notes ? ` — ${debtor.notes}` : ""}`,
            order_number: (num as string) || "",
            discount_amount: 0,
            is_public_order: false,
          } as any);
        }
      } catch {
        // best-effort; don't block the resolve action
      }
    }

    toast.success(
      newResolved
        ? "Marked as paid — added to today's pool"
        : "Marked as unpaid"
    );
    fetchDebtors();
  };

  const deleteDebtor = async (id: string) => {
    const { error } = await supabase.from("debtors").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    toast.success("Debtor removed");
    fetchDebtors();
  };

  const matchesSearch = (d: Debtor) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return d.customer_name.toLowerCase().includes(q);
  };

  const filteredAll = debtors.filter(matchesSearch);
  const unresolvedDebtors = filteredAll.filter(d => !d.is_resolved);
  const resolvedDebtors = filteredAll.filter(d => d.is_resolved);
  const totalOwed = unresolvedDebtors.reduce((s, d) => s + Number(d.amount_owed), 0);
  const showUnpaid = statusFilter !== "paid";
  const showPaid = statusFilter !== "unpaid";

  if (restaurantLoading || loading) {
    return (
      <>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Debtors</h2>
            <p className="text-muted-foreground">Track customers with outstanding payments</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Debtor
          </Button>
        </div>

        {totalOwed > 0 && (
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-amber-700">
                <AlertCircle className="h-5 w-5" />
                Total Outstanding
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatPrice(totalOwed)}</p>
              <p className="text-sm text-muted-foreground">{unresolvedDebtors.length} unpaid</p>
            </CardContent>
          </Card>
        )}

        {/* Search + status filter */}
        {debtors.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value.slice(0, 100))}
                placeholder="Search by customer name..."
                className="pl-9"
                maxLength={100}
              />
            </div>
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="unpaid">Unpaid</TabsTrigger>
                <TabsTrigger value="paid">Paid</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}

        {debtors.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No debtors recorded</p>
              <Button onClick={openCreate} variant="outline" className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Add a debtor
              </Button>
            </CardContent>
          </Card>
        ) : filteredAll.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No debtors match your filter</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {showUnpaid && unresolvedDebtors.map(debtor => (
              <Card key={debtor.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-semibold">{debtor.customer_name}</p>
                      {debtor.notes && (
                        <p className="text-sm text-muted-foreground mt-1">{debtor.notes}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Added {new Date(debtor.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-base px-3 py-1">
                        {formatPrice(debtor.amount_owed, debtor.currency)}
                      </Badge>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openOrdersDialog(debtor)} title="View orders">
                        <ReceiptIcon className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEdit(debtor)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => toggleResolved(debtor)} title="Mark as paid">
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteDebtor(debtor.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                  </div>
                </CardContent>
              </Card>
            ))}

            {showPaid && resolvedDebtors.length > 0 && (
              <>
                {showUnpaid && unresolvedDebtors.length > 0 && <Separator />}
                {statusFilter === "all" && (
                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    onClick={() => setShowResolved(!showResolved)}
                  >
                    {showResolved ? "Hide" : "Show"} {resolvedDebtors.length} resolved debtor(s)
                  </Button>
                )}
                {(statusFilter === "paid" || showResolved) && resolvedDebtors.map(debtor => (
                  <Card key={debtor.id} className="opacity-60">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="font-semibold line-through">{debtor.customer_name}</p>
                          {debtor.notes && (
                            <p className="text-sm text-muted-foreground mt-1">{debtor.notes}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            Resolved {debtor.resolved_at ? new Date(debtor.resolved_at).toLocaleDateString() : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-base px-3 py-1">
                            {formatPrice(debtor.amount_owed, debtor.currency)}
                          </Badge>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openOrdersDialog(debtor)} title="View orders">
                            <ReceiptIcon className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => toggleResolved(debtor)} title="Mark as unpaid">
                            <X className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteDebtor(debtor.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>

                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingDebtor ? "Edit Debtor" : "Add Debtor"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="debtor-name">Customer Name *</Label>
                <Input
                  id="debtor-name"
                  value={name}
                  onChange={e => setName(e.target.value.slice(0, 100))}
                  placeholder="John Doe"
                  className="mt-2"
                  maxLength={100}
                />
              </div>
              <div>
                <Label htmlFor="debtor-amount">Amount Owed (₺) *</Label>
                <Input
                  id="debtor-amount"
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-2"
                  min={0}
                  step="0.01"
                />
              </div>
              <div>
                <Label htmlFor="debtor-notes">Notes (optional)</Label>
                <Textarea
                  id="debtor-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value.slice(0, 1000))}
                  placeholder="e.g. Paid half, owes rest from last visit..."
                  className="mt-2"
                  rows={3}
                  maxLength={1000}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !name.trim() || !amount}>
                {saving ? "Saving..." : editingDebtor ? "Update" : "Add Debtor"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={ordersDialogOpen} onOpenChange={setOrdersDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Orders for {ordersDialogDebtor?.customer_name}
              </DialogTitle>
            </DialogHeader>
            {ordersDialogLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading orders…</p>
            ) : ordersDialogData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No linked orders found for this debt.
              </p>
            ) : (
              <div className="space-y-3">
                {ordersDialogData.map((o) => (
                  <div key={o.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/receipt/${o.id}`} className="font-semibold hover:underline">
                          Order #{o.order_number}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {new Date(o.created_at).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant={o.payment_status === "paid" ? "secondary" : "destructive"}>
                        {formatPrice(Number(o.total), ordersDialogDebtor?.currency)}
                      </Badge>
                    </div>
                    {o.items.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm">
                        {o.items.map((it: any, i: number) => (
                          <li key={i} className="flex justify-between text-muted-foreground">
                            <span>{it.quantity}× {it.menu_item_name}</span>
                            <span className="font-mono">{formatPrice(Number(it.subtotal), ordersDialogDebtor?.currency)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span className="font-mono">
                    {formatPrice(
                      ordersDialogData.reduce((s, o) => s + Number(o.total), 0),
                      ordersDialogDebtor?.currency
                    )}
                  </span>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOrdersDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default Debtors;

