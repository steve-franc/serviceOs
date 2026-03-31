import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Printer, ArrowLeft, Edit, Save, X, Calculator } from "lucide-react";
import { format } from "date-fns";
import { formatPrice } from "@/lib/currency";
import { PAYMENT_METHODS } from "@/lib/validations";

interface OrderData {
  id: string;
  order_number: number;
  total: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
  currency: string;
  edited_at: string | null;
}

interface OrderItemData {
  id: string;
  menu_item_name: string;
  quantity: number;
  price_at_time: number;
  subtotal: number;
  extra_units: number;
  base_price_at_time: number;
  per_unit_price_at_time: number | null;
}

const Receipt = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editPayment, setEditPayment] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editItems, setEditItems] = useState<OrderItemData[]>([]);

  // Change calculator
  const [amountGiven, setAmountGiven] = useState("");

  useEffect(() => {
    if (id) {
      fetchOrderDetails();
    }
  }, [id]);

  useEffect(() => {
    if (searchParams.get("edit") === "true" && order) {
      startEditing();
    }
  }, [order, searchParams]);

  const fetchOrderDetails = async () => {
    try {
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .single();

      if (orderError) throw orderError;

      const { data: itemsData, error: itemsError } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", id);

      if (itemsError) throw itemsError;

      setOrder(orderData as OrderData);
      setOrderItems(itemsData || []);
    } catch (error: any) {
      toast.error("Failed to load receipt");
      navigate("/orders");
    } finally {
      setLoading(false);
    }
  };

  const startEditing = () => {
    if (!order) return;
    setEditPayment(order.payment_method);
    setEditNotes(order.notes || "");
    setEditItems(orderItems.map(i => ({ ...i })));
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const updateEditItemQuantity = (itemId: string, change: number) => {
    setEditItems(prev =>
      prev.map(item =>
        item.id === itemId
          ? { ...item, quantity: Math.max(0, item.quantity + change), subtotal: (Math.max(0, item.quantity + change) * item.base_price_at_time) + (item.extra_units * (item.per_unit_price_at_time || 0)) }
          : item
      )
    );
  };

  const updateEditItemExtraUnits = (itemId: string, change: number) => {
    setEditItems(prev =>
      prev.map(item =>
        item.id === itemId
          ? { ...item, extra_units: Math.max(0, item.extra_units + change), subtotal: (item.quantity * item.base_price_at_time) + (Math.max(0, item.extra_units + change) * (item.per_unit_price_at_time || 0)) }
          : item
      )
    );
  };

  const removeEditItem = (itemId: string) => {
    setEditItems(prev => prev.filter(i => i.id !== itemId));
  };

  const editTotal = editItems.reduce((sum, i) => sum + i.subtotal, 0);

  const handleSaveEdit = async () => {
    if (!order) return;
    // Filter out items with 0 quantity and 0 extra units
    const validItems = editItems.filter(i => i.quantity > 0 || i.extra_units > 0);
    if (validItems.length === 0) {
      toast.error("Order must have at least one item");
      return;
    }
    setSaving(true);
    try {
      const newTotal = validItems.reduce((sum, i) => sum + i.subtotal, 0);

      // Update order
      const { error: orderError } = await supabase
        .from("orders")
        .update({
          total: newTotal,
          payment_method: editPayment,
          notes: editNotes || null,
          edited_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      if (orderError) throw orderError;

      // Delete removed items
      const keptIds = validItems.map(i => i.id);
      const removedIds = orderItems.filter(i => !keptIds.includes(i.id)).map(i => i.id);
      if (removedIds.length > 0) {
        const { error } = await supabase.from("order_items").delete().in("id", removedIds);
        if (error) throw error;
      }

      // Update kept items
      for (const item of validItems) {
        const { error } = await supabase
          .from("order_items")
          .update({ quantity: item.quantity, extra_units: item.extra_units, subtotal: item.subtotal })
          .eq("id", item.id);
        if (error) throw error;
      }

      toast.success("Receipt updated successfully");
      setEditing(false);
      fetchOrderDetails();
    } catch (error: any) {
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const changeAmount = amountGiven ? parseFloat(amountGiven) - (order?.total || 0) : null;

  if (loading) {
    return (
      <Layout>
        <p className="text-center text-muted-foreground">Loading receipt...</p>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout>
        <p className="text-center text-muted-foreground">Order not found</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="print:hidden flex items-center gap-3 flex-wrap">
          <Button variant="outline" onClick={() => navigate("/orders")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print Receipt
          </Button>
          {!editing && (
            <Button variant="outline" onClick={startEditing}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </div>

        {/* Change Calculator */}
        <Card className="print:hidden">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Calculator className="h-5 w-5 text-muted-foreground" />
              <Label className="text-sm font-medium whitespace-nowrap">Amount Given</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={amountGiven}
                onChange={(e) => setAmountGiven(e.target.value)}
                className="max-w-32"
                min={0}
                step="0.01"
              />
              {changeAmount !== null && !isNaN(changeAmount) && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Change:</span>
                  <span className={`font-bold text-lg ${changeAmount >= 0 ? "text-green-600" : "text-destructive"}`}>
                    {formatPrice(Math.abs(changeAmount), order.currency)}
                    {changeAmount < 0 && " short"}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="print:shadow-none">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-2xl">Restaurant POS</CardTitle>
            <p className="text-sm text-muted-foreground">Order Receipt</p>
            {order.edited_at && (
              <Badge variant="outline" className="mx-auto text-yellow-600 border-yellow-400">
                Edited on {format(new Date(order.edited_at), "PPp")}
              </Badge>
            )}
            <Separator />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Order Number</p>
                <p className="font-bold text-lg">#{order.order_number}</p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground">Date & Time</p>
                <p className="font-medium">{format(new Date(order.created_at), "PPp")}</p>
              </div>
            </div>

            <Separator />

            {editing ? (
              /* Edit Mode */
              <div className="space-y-4">
                <p className="font-semibold">Edit Order Items</p>
                {editItems.map((item) => (
                  <div key={item.id} className="space-y-2 p-3 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{item.menu_item_name}</p>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeEditItem(item.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground w-12">Qty</Label>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateEditItemQuantity(item.id, -1)}>-</Button>
                      <span className="w-8 text-center text-sm">{item.quantity}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateEditItemQuantity(item.id, 1)}>+</Button>
                    </div>
                    {item.per_unit_price_at_time && item.per_unit_price_at_time > 0 && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground w-12">Extra</Label>
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateEditItemExtraUnits(item.id, -1)}>-</Button>
                        <span className="w-8 text-center text-sm">{item.extra_units}</span>
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateEditItemExtraUnits(item.id, 1)}>+</Button>
                      </div>
                    )}
                    <p className="text-right text-sm font-medium">{formatPrice(item.subtotal, order.currency)}</p>
                  </div>
                ))}

                <Separator />

                <div>
                  <Label>Payment Method</Label>
                  <RadioGroup value={editPayment} onValueChange={setEditPayment} className="mt-2 grid grid-cols-2 gap-2">
                    {PAYMENT_METHODS.map(method => (
                      <div key={method} className="flex items-center space-x-2">
                        <RadioGroupItem value={method} id={`edit-${method}`} />
                        <Label htmlFor={`edit-${method}`} className="font-normal">{method}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <div>
                  <Label>Notes</Label>
                  <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="mt-1" rows={2} />
                </div>

                <Separator />

                <div className="flex justify-between text-xl font-bold">
                  <span>New Total</span>
                  <span className="text-primary">{formatPrice(editTotal, order.currency)}</span>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSaveEdit} disabled={saving} className="flex-1">
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button variant="outline" onClick={cancelEditing} className="flex-1">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              /* View Mode */
              <>
                <div className="space-y-3">
                  <p className="font-semibold">Order Items</p>
                  {orderItems.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <div className="flex-1">
                        <p className="font-medium">{item.menu_item_name}</p>
                        <p className="text-muted-foreground">
                          {item.quantity} × {formatPrice(item.price_at_time, order.currency)}
                          {item.extra_units > 0 && item.per_unit_price_at_time && (
                            <> + {item.extra_units} extra @ {formatPrice(item.per_unit_price_at_time, order.currency)}</>
                          )}
                        </p>
                      </div>
                      <p className="font-medium">{formatPrice(item.subtotal, order.currency)}</p>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between text-xl font-bold">
                    <span>Total</span>
                    <span className="text-primary">{formatPrice(order.total, order.currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Payment Method</span>
                    <span className="font-medium">{order.payment_method}</span>
                  </div>
                  {order.notes && (
                    <div className="pt-2">
                      <p className="text-sm text-muted-foreground">Notes</p>
                      <p className="text-sm font-medium">{order.notes}</p>
                    </div>
                  )}
                </div>

                <Separator />

                <p className="text-center text-sm text-muted-foreground">
                  Thank you for your business!
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Receipt;
