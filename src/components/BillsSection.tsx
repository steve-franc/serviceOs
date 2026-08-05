import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { useUserRole } from "@/hooks/useRestaurantAndRole";
import { useRestaurantSettings } from "@/hooks/useQueries";
import { parsePaymentMethods, getMethodNames } from "@/lib/payment-methods";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import { Plus, Pencil, Trash2, CheckCircle2, Clock, Paperclip, FileText, AlertTriangle } from "lucide-react";
import { format, parseISO, isBefore, startOfDay } from "date-fns";

interface Bill {
  id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  description: string | null;
  total_amount: number;
  original_amount: number | null;
  payment_status: "paid" | "unpaid";
  payment_method: string | null;
  due_date: string | null;
  file_url: string | null;
  file_name: string | null;
  notes: string | null;
  marked_paid_at: string | null;
  edited_at: string | null;
  created_at: string;
}

interface Supplier {
  id: string;
  supplier_name: string;
}

type FilterId = "all" | "unpaid" | "overdue";
type SortId = "newest" | "due";

const emptyForm = {
  supplier_id: "",
  supplier_name: "",
  description: "",
  total_amount: "",
  due_date: "",
  payment_method: "",
  notes: "",
  payment_status: "unpaid" as "paid" | "unpaid",
};

export function BillsSection({ suppliers = [] }: { suppliers?: Supplier[] }) {
  const { restaurantId } = useRestaurantContext();
  const { isManager, isOps } = useUserRole();
  const { data: settings } = useRestaurantSettings();
  const canEdit = isManager || isOps;

  const paymentMethods = useMemo(
    () => getMethodNames(parsePaymentMethods((settings as any)?.payment_methods)),
    [settings]
  );

  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<SortId>("newest");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(emptyForm);

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
    setFile(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (b: Bill) => {
    setEditing(b);
    setFile(null);
    setForm({
      supplier_id: b.supplier_id || "",
      supplier_name: b.supplier_name || "",
      description: b.description || "",
      total_amount: String(b.total_amount),
      due_date: b.due_date || "",
      payment_method: b.payment_method || "",
      notes: b.notes || "",
      payment_status: b.payment_status,
    });
    setDialogOpen(true);
  };

  const uploadFile = async (): Promise<{ file_url: string; file_name: string } | null> => {
    if (!file || !restaurantId) return null;
    const ext = file.name.split(".").pop() || "bin";
    const path = `${restaurantId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("bill-files").upload(path, file, { upsert: false });
    if (error) throw error;
    return { file_url: path, file_name: file.name };
  };

  const openAttachment = async (b: Bill) => {
    if (!b.file_url) return;
    const { data, error } = await supabase.storage.from("bill-files").createSignedUrl(b.file_url, 300);
    if (error || !data?.signedUrl) return toast.error("Could not open file");
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!restaurantId) return;
    const amount = parseFloat(form.total_amount);
    if (isNaN(amount) || amount < 0) return toast.error("Enter a valid amount");
    const supplier = form.supplier_id ? suppliers.find((s) => s.id === form.supplier_id) : null;
    const name = supplier?.supplier_name || form.supplier_name.trim();
    if (!name) return toast.error("Supplier / vendor name is required");

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;

    try {
      const uploaded = await uploadFile();

      if (editing) {
        const amountChanged = amount !== Number(editing.total_amount);
        const payload: any = {
          supplier_id: form.supplier_id || null,
          supplier_name: name,
          description: form.description || null,
          total_amount: amount,
          due_date: form.due_date || null,
          payment_method: form.payment_method || null,
          notes: form.notes || null,
          payment_status: form.payment_status,
        };
        if (uploaded) Object.assign(payload, uploaded);
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
          supplier_name: name,
          description: form.description || null,
          total_amount: amount,
          original_amount: amount,
          due_date: form.due_date || null,
          payment_method: form.payment_method || null,
          notes: form.notes || null,
          payment_status: form.payment_status,
          created_by: uid,
          ...(uploaded || {}),
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

  const remove = async (b: Bill) => {
    if (!confirm("Delete this bill?")) return;
    const { error } = await supabase.from("bills" as any).delete().eq("id", b.id);
    if (error) return toast.error(error.message);
    if (b.file_url) await supabase.storage.from("bill-files").remove([b.file_url]);
    toast.success("Bill deleted");
    await load();
  };

  const isOverdue = (b: Bill) =>
    b.payment_status === "unpaid" && !!b.due_date && isBefore(parseISO(b.due_date), startOfDay(new Date()));

  const totals = useMemo(() => {
    const total = bills.reduce((a, b) => a + Number(b.total_amount), 0);
    const unpaid = bills.filter((b) => b.payment_status === "unpaid").reduce((a, b) => a + Number(b.total_amount), 0);
    const overdue = bills.filter(isOverdue).reduce((a, b) => a + Number(b.total_amount), 0);
    return { total, unpaid, overdue, unpaidCount: bills.filter((b) => b.payment_status === "unpaid").length };
  }, [bills]);

  const visible = useMemo(() => {
    let list = [...bills];
    if (filter === "unpaid") list = list.filter((b) => b.payment_status === "unpaid");
    if (filter === "overdue") list = list.filter(isOverdue);
    if (sort === "due") {
      list.sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });
    } else {
      list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return list;
  }, [bills, filter, sort]);

  const filters: { id: FilterId; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unpaid", label: "Unpaid" },
    { id: "overdue", label: "Overdue" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
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

      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="font-mono font-semibold">{formatPrice(totals.total)}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Unpaid</p>
            <p className="font-mono font-semibold text-amber-600 dark:text-amber-400">{formatPrice(totals.unpaid)}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Overdue</p>
            <p className="font-mono font-semibold text-destructive">{formatPrice(totals.overdue)}</p>
          </div>
        </div>

        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden scrollbar-hide">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`inline-flex items-center whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-all flex-shrink-0 ${
                filter === f.id
                  ? "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground border-transparent"
                  : "text-muted-foreground hover:text-primary hover:border-primary/60"
              }`}
            >
              {f.label}
            </button>
          ))}
          <div className="ml-auto flex-shrink-0">
            <Select value={sort} onValueChange={(v: SortId) => setSort(v)}>
              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="due">Due date</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading && <p className="text-center py-8 text-muted-foreground text-sm">Loading…</p>}
        {!loading && visible.length === 0 && (
          <p className="text-center py-8 text-muted-foreground text-sm">No bills here</p>
        )}

        <div className="space-y-2">
          {visible.map((b) => (
            <div key={b.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{b.supplier_name || "—"}</p>
                  {b.description && <p className="text-xs text-muted-foreground">{b.description}</p>}
                  {b.notes && <p className="text-xs text-muted-foreground italic">{b.notes}</p>}
                  {b.edited_at && b.original_amount != null && Number(b.original_amount) !== Number(b.total_amount) && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Edited from {formatPrice(Number(b.original_amount))}
                    </p>
                  )}
                </div>
                <p className="font-mono font-semibold whitespace-nowrap">{formatPrice(Number(b.total_amount))}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => canEdit && togglePaid(b)} disabled={!canEdit} className="focus:outline-none">
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
                {isOverdue(b) && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> Overdue
                  </Badge>
                )}
                {b.payment_method && <Badge variant="secondary">{b.payment_method}</Badge>}
                {b.due_date && (
                  <span className="text-xs text-muted-foreground">Due {format(parseISO(b.due_date), "MMM d, yyyy")}</span>
                )}
                {b.file_url && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openAttachment(b)}>
                    <FileText className="h-3.5 w-3.5 mr-1" /> {b.file_name || "View file"}
                  </Button>
                )}
                {canEdit && (
                  <div className="ml-auto flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(b)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(b)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit bill" : "New bill"}</DialogTitle>
            <DialogDescription>Track a payable to a supplier or vendor.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            {suppliers.length > 0 && (
              <div>
                <Label>Supplier</Label>
                <Select value={form.supplier_id} onValueChange={(v) => setForm((p) => ({ ...p, supplier_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Choose supplier (optional)" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.supplier_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!form.supplier_id && (
              <div>
                <Label>Supplier / vendor name *</Label>
                <Input value={form.supplier_name} onChange={(e) => setForm((p) => ({ ...p, supplier_name: e.target.value }))} />
              </div>
            )}
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
              <Label>Payment method</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm((p) => ({ ...p, payment_method: v }))}>
                <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
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
            <div>
              <Label>Bill / receipt file</Label>
              <Input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {editing?.file_name && !file && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Paperclip className="h-3 w-3" /> Current: {editing.file_name}
                </p>
              )}
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
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
