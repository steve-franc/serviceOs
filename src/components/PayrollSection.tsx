import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import { Banknote, Plus, Trash2, CheckCircle2, Clock } from "lucide-react";

export interface PayrollStaffMember {
  id: string;
  full_name: string;
  role?: string;
}

interface PayrollEntry {
  id: string;
  staff_id: string;
  entry_date: string;
  salary_amount: number;
  payment_status: "paid" | "unpaid";
  paid_at: string | null;
  expense_id: string | null;
  notes: string | null;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function PayrollSection({
  restaurantId,
  staff,
  readOnly = false,
}: {
  restaurantId: string | null;
  staff: PayrollStaffMember[];
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<PayrollEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const nameOf = (id: string) => staffMap.get(id)?.full_name || "Staff member";

  const load = async () => {
    if (!restaurantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("payroll_entries")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("entry_date", date)
      .order("created_at", { ascending: true });
    if (error) toast.error("Could not load payroll");
    setRows(((data as any[]) || []) as PayrollEntry[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, date]);

  const total = rows.reduce((s, r) => s + Number(r.salary_amount || 0), 0);
  const paidTotal = rows.filter((r) => r.payment_status === "paid").reduce((s, r) => s + Number(r.salary_amount || 0), 0);

  const addEntry = async () => {
    if (!restaurantId || !staffId || !amount) {
      toast.error("Pick a staff member and enter an amount");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("payroll_entries").insert({
      restaurant_id: restaurantId,
      staff_id: staffId,
      entry_date: date,
      salary_amount: Number(amount),
      notes: notes.trim() || null,
    } as any);
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "That staff member is already on this day's payroll" : "Could not add to payroll");
      return;
    }
    toast.success("Added to payroll");
    setOpen(false);
    setStaffId(""); setAmount(""); setNotes("");
    load();
  };

  const toggleStatus = async (row: PayrollEntry) => {
    if (readOnly || !restaurantId) return;
    setBusyId(row.id);
    try {
      if (row.payment_status === "unpaid") {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: expense, error: expErr } = await supabase
          .from("daily_expenses")
          .insert({
            restaurant_id: restaurantId,
            staff_id: user?.id,
            amount: Number(row.salary_amount),
            description: `Payroll: ${nameOf(row.staff_id)}`,
            category: "Payroll",
            source: "payroll",
          } as any)
          .select("id")
          .single();
        if (expErr) throw expErr;
        const { error } = await supabase
          .from("payroll_entries")
          .update({
            payment_status: "paid",
            paid_at: new Date().toISOString(),
            paid_by: user?.id ?? null,
            expense_id: expense?.id ?? null,
          } as any)
          .eq("id", row.id);
        if (error) throw error;
        toast.success("Marked paid — deducted from the day's sales");
      } else {
        if (row.expense_id) {
          await supabase.from("daily_expenses").delete().eq("id", row.expense_id);
        }
        const { error } = await supabase
          .from("payroll_entries")
          .update({ payment_status: "unpaid", paid_at: null, paid_by: null, expense_id: null } as any)
          .eq("id", row.id);
        if (error) throw error;
        toast.success("Marked unpaid — amount restored to the day's sales");
      }
      qc.invalidateQueries({ queryKey: ["expenses", restaurantId] });
      load();
    } catch (e: any) {
      toast.error(e?.message || "Could not update payroll");
    } finally {
      setBusyId(null);
    }
  };

  const removeEntry = async (row: PayrollEntry) => {
    if (row.expense_id) await supabase.from("daily_expenses").delete().eq("id", row.expense_id);
    const { error } = await supabase.from("payroll_entries").delete().eq("id", row.id);
    if (error) { toast.error("Could not remove entry"); return; }
    qc.invalidateQueries({ queryKey: ["expenses", restaurantId] });
    toast.success("Removed from payroll");
    load();
  };

  const available = staff.filter((s) => !rows.some((r) => r.staff_id === s.id));

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Banknote className="h-4 w-4" /> Payroll</CardTitle>
            <CardDescription>Daily staff payroll. Paid entries are deducted from the day's sales.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[160px] text-base" />
            {!readOnly && (
              <Button onClick={() => setOpen(true)} disabled={!restaurantId}>
                <Plus className="h-4 w-4 mr-1.5" /> Add
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 rounded-lg border border-border bg-muted/40 p-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total payroll</p>
            <p className="text-2xl font-bold font-mono">{formatPrice(total)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Paid</p>
            <p className="text-2xl font-bold font-mono">{formatPrice(paidTotal)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading payroll...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No staff on payroll for this date.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{nameOf(r.staff_id)}</p>
                  {r.notes && <p className="text-xs text-muted-foreground truncate">{r.notes}</p>}
                </div>
                <p className="font-mono font-semibold">{formatPrice(Number(r.salary_amount))}</p>
                <button
                  type="button"
                  disabled={readOnly || busyId === r.id}
                  onClick={() => toggleStatus(r)}
                  title="Toggle paid/unpaid"
                >
                  <Badge variant={r.payment_status === "paid" ? "default" : "secondary"} className="cursor-pointer gap-1">
                    {r.payment_status === "paid" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {r.payment_status === "paid" ? "Paid" : "Unpaid"}
                  </Badge>
                </button>
                {!readOnly && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeEntry(r)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add to payroll</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Staff member</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger className="mt-2"><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {available.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="payroll-amount">Salary amount</Label>
              <Input id="payroll-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-2 text-base" placeholder="0.00" />
            </div>
            <div>
              <Label htmlFor="payroll-notes">Notes (optional)</Label>
              <Input id="payroll-notes" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 200))} className="mt-2 text-base" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={addEntry} disabled={saving}>{saving ? "Adding..." : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
