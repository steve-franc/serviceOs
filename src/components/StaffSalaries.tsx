import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import { Wallet, Plus, Pencil, Trash2, CheckCircle2, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";

export interface SalaryStaffMember {
  id: string;
  full_name: string;
  role?: string;
}

interface Salary {
  id: string;
  staff_id: string;
  amount: number;
  payment_frequency: "daily" | "weekly" | "monthly";
  payment_status: "paid" | "unpaid";
  due_date: string | null;
  paid_date: string | null;
}

const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

const emptyForm = {
  id: "",
  staff_id: "",
  amount: "",
  payment_frequency: "monthly" as Salary["payment_frequency"],
  payment_status: "unpaid" as Salary["payment_status"],
  due_date: "",
};

export function StaffSalaries({
  restaurantId,
  staff,
  readOnly = false,
}: {
  restaurantId: string | null;
  staff: SalaryStaffMember[];
  readOnly?: boolean;
}) {
  const [rows, setRows] = useState<Salary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const load = async () => {
    if (!restaurantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("staff_salaries")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false });
    if (error) toast.error("Could not load salaries");
    setRows((data as Salary[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const openNew = () => {
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (s: Salary) => {
    setForm({
      id: s.id,
      staff_id: s.staff_id,
      amount: String(s.amount ?? ""),
      payment_frequency: s.payment_frequency,
      payment_status: s.payment_status,
      due_date: s.due_date || "",
    });
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId) return;
    const amount = parseFloat(form.amount);
    if (!form.staff_id) return toast.error("Select a staff member");
    if (isNaN(amount) || amount < 0) return toast.error("Enter a valid amount");

    setSaving(true);
    const payload = {
      restaurant_id: restaurantId,
      staff_id: form.staff_id,
      amount,
      payment_frequency: form.payment_frequency,
      payment_status: form.payment_status,
      due_date: form.due_date || null,
    };
    const { error } = form.id
      ? await supabase.from("staff_salaries").update(payload).eq("id", form.id)
      : await supabase.from("staff_salaries").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(form.id ? "Salary updated" : "Salary added");
    setOpen(false);
    load();
  };

  const toggleStatus = async (s: Salary) => {
    if (readOnly) return;
    const next = s.payment_status === "paid" ? "unpaid" : "paid";
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("staff_salaries")
      .update({
        payment_status: next,
        paid_date: next === "paid" ? new Date().toISOString() : null,
        paid_by: next === "paid" ? userData.user?.id ?? null : null,
      })
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    setRows((p) => p.map((r) => (r.id === s.id ? { ...r, payment_status: next } : r)));
  };

  const remove = async (s: Salary) => {
    if (!confirm("Delete this salary record?")) return;
    const { error } = await supabase.from("staff_salaries").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    setRows((p) => p.filter((r) => r.id !== s.id));
  };

  const totalUnpaid = rows.filter((r) => r.payment_status === "unpaid").reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Staff Salaries</CardTitle>
          <CardDescription>
            {rows.length} record{rows.length === 1 ? "" : "s"} · {formatPrice(totalUnpaid)} unpaid
          </CardDescription>
        </div>
        {!readOnly && (
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1.5" /> Add Salary</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">No salaries recorded yet</p>
        )}
        {rows.map((s) => (
          <div key={s.id} className="flex items-center gap-3 flex-wrap rounded-lg border border-border p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{staffMap.get(s.staff_id)?.full_name || "Unknown staff"}</p>
              <p className="text-xs text-muted-foreground">
                {FREQUENCIES.find((f) => f.value === s.payment_frequency)?.label}
                {s.due_date ? ` · due ${format(parseISO(s.due_date), "MMM d, yyyy")}` : ""}
              </p>
            </div>
            <span className="font-mono font-semibold">{formatPrice(Number(s.amount))}</span>
            <button type="button" onClick={() => toggleStatus(s)} disabled={readOnly} className="focus:outline-none">
              {s.payment_status === "paid" ? (
                <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 gap-1"><CheckCircle2 className="h-3 w-3" /> Paid</Badge>
              ) : (
                <Badge className="bg-amber-500 hover:bg-amber-600 text-white border-0 gap-1"><Clock className="h-3 w-3" /> Unpaid</Badge>
              )}
            </button>
            {!readOnly && (
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(s)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit salary" : "Add salary"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div>
              <Label>Staff member *</Label>
              <Select value={form.staff_id} onValueChange={(v) => setForm((p) => ({ ...p, staff_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount *</Label>
              <Input type="number" inputMode="decimal" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Frequency</Label>
                <Select value={form.payment_frequency} onValueChange={(v: Salary["payment_frequency"]) => setForm((p) => ({ ...p, payment_frequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.payment_status} onValueChange={(v: Salary["payment_status"]) => setForm((p) => ({ ...p, payment_status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">✓ Paid</SelectItem>
                    <SelectItem value="unpaid">⏳ Unpaid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Due date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
