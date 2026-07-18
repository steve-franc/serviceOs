import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { useUserRole } from "@/hooks/useRestaurantAndRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import { Plus, Pencil, Trash2, CheckCircle2, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Bill {
  id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  description: string | null;
  total_amount: number;
  original_amount: number | null;
  payment_status: "paid" | "unpaid";
  due_date: string | null;
  marked_paid_at: string | null;
  edited_at: string | null;
  created_at: string;
}

interface Supplier {
  id: string;
  supplier_name: string;
}

export function BillsSection({ suppliers }: { suppliers: Supplier[] }) {
  const { restaurantId } = useRestaurantContext();
  const { isManager, isOps } = useUserRole();
  const canEdit = isManager || isOps;

  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    supplier_id: "",
    supplier_name: "",
    description: "",
    total_amount: "",
    due_date: "",
    payment_status: "unpaid" as "paid" | "unpaid",
  });

  const load = async () => {
    if (!restaurantId) return;
    setLoading(true);
    const { data } = await supabase
      .from("bills" as any)
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false });
    setBills((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const openNew = () => {
    setEditing(null);
    setForm({ supplier_id: "", supplier_name: "", description: "", total_amount: "", due_date: "", payment_status: "unpaid" });
    setDialogOpen(true);
  };

  const openEdit = (b: Bill) => {
    setEditing(b);
    setForm({
      supplier_id: b.supplier_id || "",
      supplier_name: b.supplier_name || "",
      description: b.description || "",
      total_amount: String(b.total_amount),
      due_date: b.due_date || "",
      payment_status: b.payment_status,
    });
    setDialogOpen(true);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!restaurantId) return;
    const amount = parseFloat(form.total_amount);
    if (isNaN(amount) || amount < 0) return toast.error("Enter a valid amount");
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    const supplier = form.supplier_id ? suppliers.find((s) => s.id === form.supplier_id) : null;

    try {
      if (editing) {
        const amountChanged = amount !== Number(editing.total_amount);
        const payload: any = {
          supplier_id: form.supplier_id || null,
          supplier_name: supplier?.supplier_name || form.supplier_name || null,
          description: form.description || null,
          total_amount: amount,
          due_date: form.due_date || null,
          payment_status: form.payment_status,
        };
        if (amountChanged) {
          payload.original_amount = editing.original_amount ?? Number(editing.total_amount);
          payload.edited_by = uid;
          payload.edited_at = new Date().toISOString();
        }
        if (form.payment_status !== editing.payment_status) {
          payload.marked_paid_at = form.payment_status === "paid" ? new Date().toISOString() : null;
          payload.marked_paid_by = form.payment_status === "paid" ? uid : null;
        }
        const { error } = await supabase.from("bills" as any).update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Bill updated");
      } else {
        const payload: any = {
          restaurant_id: restaurantId,
          supplier_id: form.supplier_id || null,
          supplier_name: supplier?.supplier_name || form.supplier_name || null,
          description: form.description || null,
          total_amount: amount,
          original_amount: amount,
          due_date: form.due_date || null,
          payment_status: form.payment_status,
          created_by: uid,
        };
        if (form.payment_status === "paid") {
          payload.marked_paid_at = new Date().toISOString();
          payload.marked_paid_by = uid;
        }
        const { error } = await supabase.from("bills" as any).insert(payload);
        if (error) throw error;
        toast.success("Bill added");
      }
      setDialogOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to save bill");
    } finally {
      setSaving(false);
    }
  };

  const togglePaid = async (b: Bill) => {
    const next = b.payment_status === "paid" ? "unpaid" : "paid";
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    const { error } = await supabase
      .from("bills" as any)
      .update({
        payment_status: next,
        marked_paid_at: next === "paid" ? new Date().toISOString() : null,
        marked_paid_by: next === "paid" ? uid : null,
      })
      .eq("id", b.id);
    if (error) return toast.error(error.message);
    toast.success(next === "paid" ? "Marked paid" : "Marked unpaid");
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this bill?")) return;
    const { error } = await supabase.from("bills" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Bill deleted");
    await load();
  };

  const totals = useMemo(() => {
    const unpaid = bills.filter((b) => b.payment_status === "unpaid").reduce((a, b) => a + Number(b.total_amount), 0);
    const paid = bills.filter((b) => b.payment_status === "paid").reduce((a, b) => a + Number(b.total_amount), 0);
    return { unpaid, paid, unpaidCount: bills.filter((b) => b.payment_status === "unpaid").length };
  }, [bills]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Bills</CardTitle>
          <CardDescription>
            {totals.unpaidCount > 0
              ? `${totals.unpaidCount} unpaid · ${formatPrice(totals.unpaid)} outstanding`
              : "All bills settled"}
          </CardDescription>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Add Bill
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier / Description</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
                </TableRow>
              )}
              {!loading && bills.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No bills yet</TableCell>
                </TableRow>
              )}
              {bills.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <p className="font-medium">{b.supplier_name || "—"}</p>
                    {b.description && <p className="text-xs text-muted-foreground">{b.description}</p>}
                    {b.edited_at && b.original_amount != null && Number(b.original_amount) !== Number(b.total_amount) && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Edited from {formatPrice(Number(b.original_amount))}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {b.due_date ? format(parseISO(b.due_date), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => canEdit && togglePaid(b)}
                      disabled={!canEdit}
                      className="focus:outline-none"
                    >
                      {b.payment_status === "paid" ? (
                        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Paid
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500 hover:bg-amber-600 text-white border-0 gap-1">
                          <Clock className="h-3 w-3" /> Unpaid
                        </Badge>
                      )}
                    </button>
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatPrice(Number(b.total_amount))}
                  </TableCell>
                  <TableCell className="text-right">
                    {canEdit && (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(b)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(b.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit bill" : "New bill"}</DialogTitle>
            <DialogDescription>Track a payable to a supplier or vendor.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>Supplier</Label>
              <Select value={form.supplier_id} onValueChange={(v) => setForm((p) => ({ ...p, supplier_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Choose supplier (optional)" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.supplier_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!form.supplier_id && (
              <div>
                <Label>Or supplier/vendor name</Label>
                <Input value={form.supplier_name} onChange={(e) => setForm((p) => ({ ...p, supplier_name: e.target.value }))} />
              </div>
            )}
            <div>
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount *</Label>
                <Input type="number" inputMode="decimal" step="0.01" value={form.total_amount} onChange={(e) => setForm((p) => ({ ...p, total_amount: e.target.value }))} />
              </div>
              <div>
                <Label>Due date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Payment status</Label>
              <Select value={form.payment_status} onValueChange={(v: "paid" | "unpaid") => setForm((p) => ({ ...p, payment_status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">⏳ Unpaid</SelectItem>
                  <SelectItem value="paid">✓ Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add bill"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
