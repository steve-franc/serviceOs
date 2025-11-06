import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Plus, Minus, ShoppingCart, ChevronDown, ChevronRight, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/currency";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
interface MenuItem {
  id: string;
  name: string;
  category: string | null;
  base_price: number;
  per_unit_price: number | null;
  description: string | null;
  pricing_unit: string;
  currency: string;
  staff_id: string;
  staff_name?: string;
}
interface OrderItem {
  menuItem: MenuItem;
  quantity: number;
  extraUnits: number;
}
const CreateOrder = () => {
  const navigate = useNavigate();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetchSettings();
    fetchMenuItems();
  }, []);
  const fetchSettings = async () => {
    const {
      data
    } = await supabase.from("restaurant_settings").select("currency").single();
    if (data) {
      setCurrency(data.currency);
    }
  };
  const fetchMenuItems = async () => {
    const {
      data,
      error
    } = await supabase.from("menu_items")
      .select(`
        *,
        profiles!menu_items_staff_id_fkey(full_name)
      `)
      .eq("is_available", true)
      .order("name");
    
    if (error) {
      toast.error("Failed to load menu");
      return;
    }
    
    const itemsWithStaff = (data || []).map((item: any) => ({
      ...item,
      staff_name: item.profiles?.full_name || "Unknown"
    }));
    
    setMenuItems(itemsWithStaff);
  };
  const addToOrder = (menuItem: MenuItem) => {
    // Validate currency matches restaurant currency
    if (menuItem.currency !== currency) {
      toast.error(`This item uses ${menuItem.currency} but the restaurant uses ${currency}`);
      return;
    }
    
    const existing = orderItems.find(item => item.menuItem.id === menuItem.id);
    if (existing) {
      setOrderItems(orderItems.map(item => item.menuItem.id === menuItem.id ? {
        ...item,
        quantity: item.quantity + 1
      } : item));
    } else {
      setOrderItems([...orderItems, {
        menuItem,
        quantity: 1,
        extraUnits: 0
      }]);
    }
  };
  const updateQuantity = (menuItemId: string, change: number) => {
    setOrderItems(orderItems.map(item => item.menuItem.id === menuItemId ? {
      ...item,
      quantity: Math.max(0, item.quantity + change)
    } : item).filter(item => item.quantity > 0 || item.extraUnits > 0));
  };
  const updateExtraUnits = (menuItemId: string, change: number) => {
    setOrderItems(orderItems.map(item => item.menuItem.id === menuItemId ? {
      ...item,
      extraUnits: Math.max(0, item.extraUnits + change)
    } : item).filter(item => item.quantity > 0 || item.extraUnits > 0));
  };
  const calculateItemTotal = (item: OrderItem) => {
    const baseTotal = item.menuItem.base_price * item.quantity;
    const extraTotal = (item.menuItem.per_unit_price || 0) * item.extraUnits;
    return baseTotal + extraTotal;
  };
  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  };
  const handleSubmitOrder = async () => {
    if (orderItems.length === 0) {
      toast.error("Please add items to the order");
      return;
    }
    setLoading(true);
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const total = calculateTotal();
      const {
        data: order,
        error: orderError
      } = await supabase.from("orders").insert([{
        staff_id: user.id,
        total,
        payment_method: paymentMethod,
        notes: notes || null,
        currency: currency,
        is_public_order: false
      }]).select().single();
      if (orderError) throw orderError;
      const orderItemsData = orderItems.map(item => ({
        order_id: order.id,
        menu_item_id: item.menuItem.id,
        menu_item_name: item.menuItem.name,
        quantity: item.quantity,
        extra_units: item.extraUnits,
        base_price_at_time: item.menuItem.base_price,
        per_unit_price_at_time: item.menuItem.per_unit_price,
        price_at_time: item.menuItem.base_price,
        subtotal: calculateItemTotal(item)
      }));
      const {
        error: itemsError
      } = await supabase.from("order_items").insert(orderItemsData);
      if (itemsError) throw itemsError;
      toast.success(`Order #${order.order_number} created successfully!`);
      navigate(`/receipt/${order.id}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to create order");
    } finally {
      setLoading(false);
    }
  };
  // Group by staff member (restaurant)
  const groupedByStaff = menuItems.reduce((acc, item) => {
    const staffId = item.staff_id;
    if (!acc[staffId]) {
      acc[staffId] = {
        staffName: item.staff_name || "Unknown",
        items: []
      };
    }
    acc[staffId].items.push(item);
    return acc;
  }, {} as Record<string, { staffName: string; items: MenuItem[] }>);

  const toggleStaff = (staffId: string) => {
    const newExpanded = new Set(expandedStaff);
    if (newExpanded.has(staffId)) {
      newExpanded.delete(staffId);
    } else {
      newExpanded.add(staffId);
    }
    setExpandedStaff(newExpanded);
  };
  return <Layout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h2 className="text-3xl font-bold">Create Order</h2>
          <p className="text-muted-foreground">Select items to add to the order</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Menu Items - Grouped by Staff/Restaurant */}
          <div className="lg:col-span-2 space-y-4">
            {Object.entries(groupedByStaff).map(([staffId, { staffName, items }]) => {
              const isExpanded = expandedStaff.has(staffId);
              
              return (
                <Card key={staffId}>
                  <Collapsible open={isExpanded} onOpenChange={() => toggleStaff(staffId)}>
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Store className="h-5 w-5 text-primary" />
                            <div className="text-left">
                              <CardTitle className="text-lg">{staffName}</CardTitle>
                              <CardDescription className="text-sm">
                                {items.length} {items.length === 1 ? 'item' : 'items'} available
                              </CardDescription>
                            </div>
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        <div className="grid gap-3 sm:grid-cols-2">
                          {items.map(item => (
                            <Card 
                              key={item.id} 
                              className="cursor-pointer hover:shadow-md transition-shadow border-2" 
                              onClick={() => addToOrder(item)}
                            >
                              <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                  <CardTitle className="text-base">{item.name}</CardTitle>
                                  <div className="flex flex-col items-end gap-1">
                                    <Badge variant="secondary">
                                      {formatPrice(item.base_price, item.currency)}
                                    </Badge>
                                    {item.per_unit_price && (
                                      <Badge variant="outline" className="text-xs">
                                        +{formatPrice(item.per_unit_price, item.currency)} / {item.pricing_unit}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                {item.description && (
                                  <CardDescription className="text-sm">{item.description}</CardDescription>
                                )}
                                {item.category && (
                                  <Badge variant="outline" className="w-fit text-xs mt-2">
                                    {item.category}
                                  </Badge>
                                )}
                              </CardHeader>
                            </Card>
                          ))}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}

            {menuItems.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No menu items available</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Current Order
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {orderItems.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">
                    No items added yet
                  </p> : <div className="space-y-3">
                    {orderItems.map(item => <div key={item.menuItem.id} className="space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{item.menuItem.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.quantity > 0 
                                ? `${formatPrice(item.menuItem.base_price, item.menuItem.currency)} base`
                                : "Only extra units"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.menuItem.id, -1)}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">
                              {item.quantity}
                            </span>
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.menuItem.id, 1)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        
                        {item.menuItem.per_unit_price && <div className="flex items-center gap-2 pl-2">
                            <Label className="text-xs text-muted-foreground flex-1">
                              Extra {item.menuItem.pricing_unit}s (+{formatPrice(item.menuItem.per_unit_price, item.menuItem.currency)})
                            </Label>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateExtraUnits(item.menuItem.id, -1)}>
                                <Minus className="h-2 w-2" />
                              </Button>
                              <span className="w-6 text-center text-xs">
                                {item.extraUnits}
                              </span>
                              <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateExtraUnits(item.menuItem.id, 1)}>
                                <Plus className="h-2 w-2" />
                              </Button>
                            </div>
                          </div>}
                        
                        <div className="flex justify-end">
                          <p className="font-medium text-sm">
                            {formatPrice(calculateItemTotal(item), item.menuItem.currency)}
                          </p>
                        </div>
                      </div>)}
                  </div>}

                <Separator />

                <div className="space-y-3">
                  <div>
                    <Label>Payment Method</Label>
                    <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="mt-2">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Cash" id="cash" />
                        <Label htmlFor="cash" className="font-normal">
                          Cash
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Card" id="card" />
                        <Label htmlFor="card" className="font-normal">
                          Card
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div>
                    <Label htmlFor="notes">Notes (Optional)</Label>
                    <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Special instructions..." className="mt-2" rows={2} />
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span className="text-[435663] text-[#f97415]">{formatPrice(calculateTotal(), currency)}</span>
                  </div>
                  <Button size="lg" onClick={handleSubmitOrder} disabled={loading || orderItems.length === 0} className="w-full bg-[435663] bg-[#435663]">
                    {loading ? "Processing..." : "Complete Order"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>;
};
export default CreateOrder;