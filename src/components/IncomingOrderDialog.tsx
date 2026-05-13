import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { useAuth } from "@/hooks/useRestaurantAndRole";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Globe, Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { toast } from "sonner";
import { stopAlarm } from "@/components/NotificationSound";
import { useInvalidateOrders } from "@/hooks/useQueries";

interface PendingItem {
  id: string;
  menu_item_name: string;
  quantity: number;
  subtotal: number;
}
interface PendingOrder {
  id: string;
  order_number: string;
  total: number;
  customer_name: string | null;
  customer_phone: string | null;
  customer_location: string | null;
  notes: string | null;
  payment_method: string;
  created_at: string;
  items: PendingItem[];
}

export const IncomingOrderDialog = () => {
  const location = useLocation();
  const isPublicRoute =
    location.pathname.startsWith("/order/") && location.pathname !== "/order/create" ||
    location.pathname.startsWith("/receipt/") ||
    location.pathname === "/auth" ||
    location.pathname === "/";
  const { restaurantId } = useRestaurantContext();
  const { user } = useAuth();
  const invalidateOrders = useInvalidateOrders();
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    if (!restaurantId) return;
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, total, customer_name, customer_phone, customer_location, notes, payment_method, created_at, order_items(id, menu_item_name, quantity, subtotal)")
      .eq("restaurant_id", restaurantId)
      .eq("is_public_order", true)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) return;
    setPending(
      (data || []).map((o: any) => ({
        ...o,
        items: o.order_items || [],
      }))
    );
  }, [restaurantId]);

  useEffect(() => {
    if (isPublicRoute) return;
    if (!restaurantId || !user) return;
    fetchPending();
    const channel = supabase
      .channel("incoming-orders-popup")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        () => fetchPending()
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [restaurantId, user, fetchPending]);

  // Stop the alarm whenever the queue empties.
  useEffect(() => {
    if (pending.length === 0) stopAlarm();
  }, [pending.length]);

  const current = pending[0];
  const open = !!current;

  const handleConfirm = async () => {
    if (!current) return;
    setBusyId(current.id);
    try {
      const { error } = await supabase.from("orders").update({ status: "confirmed" } as any).eq("id", current.id);
      if (error) throw error;
      toast.dismiss(`pending-order-${current.id}`);
      toast.success("Order confirmed!");
      setPending((prev) => prev.filter((o) => o.id !== current.id));
      invalidateOrders();
    } catch {
      toast.error("Failed to confirm order");
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async () => {
    if (!current) return;
    setBusyId(current.id);
    try {
      const { error: itemsError } = await supabase.from("order_items").delete().eq("order_id", current.id);
      if (itemsError) throw itemsError;
      const { error } = await supabase.from("orders").delete().eq("id", current.id);
      if (error) throw error;
      toast.dismiss(`pending-order-${current.id}`);
      toast.success("Order declined and removed");
      setPending((prev) => prev.filter((o) => o.id !== current.id));
      invalidateOrders();
    } catch {
      toast.error("Failed to decline order");
    } finally {
      setBusyId(null);
    }
  };

  if (!current) return null;
  const busy = busyId === current.id;

  return (
    <Dialog open={open} onOpenChange={() => { /* not dismissible — must accept/reject */ }}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            New online order
            {pending.length > 1 && (
              <Badge variant="secondary" className="ml-auto">+{pending.length - 1} more</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Order #{current.order_number} from {current.customer_name || "a customer"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {(current.customer_phone || current.customer_location) && (
            <div className="text-muted-foreground space-y-1">
              {current.customer_phone && <div>Phone: {current.customer_phone}</div>}
              {current.customer_location && <div>Location: {current.customer_location}</div>}
            </div>
          )}

          <Separator />

          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {current.items.map((it) => (
              <div key={it.id} className="flex justify-between gap-3">
                <span className="truncate">{it.quantity}× {it.menu_item_name}</span>
                <span className="font-mono text-muted-foreground shrink-0">{formatPrice(it.subtotal)}</span>
              </div>
            ))}
          </div>

          <Separator />

          <div className="flex justify-between font-medium">
            <span>Total</span>
            <span className="font-mono">{formatPrice(current.total)}</span>
          </div>

          {current.notes && (
            <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Notes: </span>{current.notes}
            </div>
          )}

          <div className="text-xs text-muted-foreground">Payment: {current.payment_method}</div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={handleDecline}
            disabled={busy}
            className="flex-1"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><XCircle className="w-4 h-4 mr-1.5" />Reject</>}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={busy}
            className="flex-1"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle className="w-4 h-4 mr-1.5" />Accept</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default IncomingOrderDialog;
