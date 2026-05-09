import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";

interface UnpaidOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    id: string;
    order_number: string;
    total: number;
    customer_name?: string | null;
  } | null;
  restaurantId: string | null;
  /** Called after the order has been marked unpaid AND debtor created/updated. */
  onComplete: () => void;
}

/**
 * Marks an order as unpaid AND creates/updates a debtor record.
 * If a debtor with the same (case-insensitive) name already exists and is unresolved,
 * the order's total is added to their balance.
 */
export function UnpaidOrderDialog({ open, onOpenChange, order, restaurantId, onComplete }: UnpaidOrderDialogProps) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && order) {
      setName(order.customer_name?.trim() || "");
      setNotes(`From order #${order.order_number}`);
    }
  }, [open, order]);

  const handleConfirm = async () => {
    if (!order || !restaurantId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Customer name is required");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Mark order unpaid first
      const { error: orderErr } = await supabase
        .from("orders")
        .update({ payment_status: "unpaid" } as any)
        .eq("id", order.id);
      if (orderErr) throw orderErr;

      // Look for an existing UNRESOLVED debtor with the same name (case-insensitive)
      const { data: existing } = await supabase
        .from("debtors")
        .select("id, amount_owed, notes")
        .eq("restaurant_id", restaurantId)
        .eq("is_resolved", false)
        .ilike("customer_name", trimmed)
        .limit(1)
        .maybeSingle();

      const amount = Number(order.total) || 0;

      if (existing) {
        const newAmount = Number(existing.amount_owed || 0) + amount;
        const newNotes = [existing.notes, notes.trim()].filter(Boolean).join(" • ").slice(0, 1000);
        const { error } = await supabase
          .from("debtors")
          .update({
            amount_owed: newAmount,
            notes: newNotes || null,
            customer_name: trimmed,
            source_order_id: order.id,
          } as any)
          .eq("id", existing.id);
        if (error) throw error;
        toast.success(`Added ${formatPrice(amount)} to ${trimmed}'s balance`);
      } else {
        const { error } = await supabase.from("debtors").insert({
          restaurant_id: restaurantId,
          staff_id: user.id,
          customer_name: trimmed,
          amount_owed: amount,
          notes: notes.trim() || null,
          source_order_id: order.id,
        } as any);
        if (error) throw error;
        toast.success(`${trimmed} added to debtors (${formatPrice(amount)})`);
      }

      onOpenChange(false);
      onComplete();
    } catch (err: any) {
      toast.error(err.message || "Failed to mark unpaid");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark order #{order?.order_number} as unpaid</DialogTitle>
          <DialogDescription>
            This will deduct {order ? formatPrice(order.total) : ""} from today's revenue and add it to a debtor's balance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="unpaid-name">Customer name *</Label>
            <Input
              id="unpaid-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 100))}
              placeholder="e.g. John Doe"
              maxLength={100}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              If this name already exists in debtors, the amount will be added to their balance.
            </p>
          </div>
          <div>
            <Label htmlFor="unpaid-notes">Notes (optional)</Label>
            <Textarea
              id="unpaid-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
              rows={2}
              maxLength={500}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={saving || !name.trim()}>
            {saving ? "Saving..." : "Confirm unpaid"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UnpaidOrderDialog;
