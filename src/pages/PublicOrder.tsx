import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Plus, Minus, ShoppingCart, UtensilsCrossed, X, Percent, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatPrice, getCurrencySymbol } from "@/lib/currency";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHaptics } from "@/hooks/use-haptics";
import { publicOrderSchema, validateInput, PAYMENT_METHODS } from "@/lib/validations";
interface MenuItem {
  id: string;
  name: string;
  category: string | null;
  base_price: number;
  per_unit_price: number | null;
  description: string | null;
  pricing_unit: string;
  currency: string;
}

interface OrderItem {
  menuItem: MenuItem;
  quantity: number;
  extraUnits: number;
}

const PublicOrder = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const haptics = useHaptics();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [notes, setNotes] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [restaurantName, setRestaurantName] = useState("Restaurant");
  const [currency, setCurrency] = useState("USD");
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    fetchMenuItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("restaurant_settings")
      .select("restaurant_id, restaurant_name, currency")
      .maybeSingle();
    
    if (data) {
      setRestaurantName(data.restaurant_name);
      setCurrency(data.currency);
      setRestaurantId(data.restaurant_id ?? null);
    }
  };

  const fetchMenuItems = async () => {
    if (!restaurantId) return;
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("is_available", true)
      .eq("restaurant_id", restaurantId)
      .order("category")
      .order("name");

    if (error) {
      toast.error("Failed to load menu");
      return;
    }
    setMenuItems(data || []);
  };

  const addToOrder = (menuItem: MenuItem) => {
    // Validate currency matches restaurant currency
    if (menuItem.currency !== currency) {
      toast.error(`This item uses ${menuItem.currency} but the restaurant uses ${currency}`);
      return;
    }

    if (isMobile) haptics.tap();
    
    const existing = orderItems.find((item) => item.menuItem.id === menuItem.id);
    if (existing) {
      setOrderItems(
        orderItems.map((item) =>
          item.menuItem.id === menuItem.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      );
    } else {
      setOrderItems([...orderItems, { menuItem, quantity: 1, extraUnits: 0 }]);
    }
  };

  // Only remove item when both base and per-unit contributions are zero
  const shouldKeepItem = (item: OrderItem) => {
    // Keep if quantity > 0 (has base order)
    if (item.quantity > 0) return true;
    // Keep if extraUnits > 0 (has per-unit order)
    if (item.extraUnits > 0) return true;
    // Keep if item has per_unit_price - allows adding extra units even with 0 base quantity
    if (item.menuItem.per_unit_price && item.menuItem.per_unit_price > 0) return true;
    // Remove if base_price is also 0 (nothing to order)
    return item.menuItem.base_price > 0;
  };

  const updateQuantity = (menuItemId: string, change: number) => {
    setOrderItems(
      orderItems
        .map((item) =>
          item.menuItem.id === menuItemId
            ? { ...item, quantity: Math.max(0, item.quantity + change) }
            : item
        )
        .filter(shouldKeepItem)
    );
  };

  const updateExtraUnits = (menuItemId: string, change: number) => {
    setOrderItems(
      orderItems
        .map((item) =>
          item.menuItem.id === menuItemId
            ? { ...item, extraUnits: Math.max(0, item.extraUnits + change) }
            : item
        )
        .filter(shouldKeepItem)
    );
  };

  const removeFromOrder = (menuItemId: string) => {
    if (isMobile) haptics.tap();
    setOrderItems(orderItems.filter(item => item.menuItem.id !== menuItemId));
  };

  const resetOrderState = () => {
    setOrderItems([]);
    setPaymentMethod("Cash");
    setNotes("");
    setCustomerName("");
    setCustomerEmail("");
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

    // Validate all input fields
    const validation = validateInput(publicOrderSchema, {
      customerName,
      customerEmail,
      notes: notes || undefined,
      paymentMethod,
    });

    if (!validation.success) {
      toast.error(validation.error);
      return;
    }

    const validatedData = validation.data;

    setLoading(true);
    try {
      const total = calculateTotal();

      if (!restaurantId) throw new Error("Restaurant not configured");

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert([
          {
            staff_id: '00000000-0000-0000-0000-000000000000',
            total,
            payment_method: paymentMethod,
            notes: notes || null,
            customer_name: customerName,
            customer_email: customerEmail,
            is_public_order: true,
            currency: currency,
            restaurant_id: restaurantId,
            order_number: 0, // Trigger will set the correct number
          },
        ])
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItemsData = orderItems.map((item) => ({
        order_id: order.id,
        menu_item_id: item.menuItem.id,
        menu_item_name: item.menuItem.name,
        quantity: item.quantity,
        extra_units: item.extraUnits,
        base_price_at_time: item.menuItem.base_price,
        per_unit_price_at_time: item.menuItem.per_unit_price,
        price_at_time: item.menuItem.base_price,
        subtotal: calculateItemTotal(item),
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(orderItemsData);

      if (itemsError) throw itemsError;

      toast.success(`Order #${order.order_number} placed successfully!`);
      resetOrderState();
      navigate(`/receipt/${order.id}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to place order");
    } finally {
      setLoading(false);
    }
  };

  const groupedItems = menuItems.reduce((acc, item) => {
    const category = item.category || "Other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-accent text-primary-foreground py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <UtensilsCrossed className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-bold">{restaurantName}</h1>
          </div>
          <p className="text-primary-foreground/90">Browse our menu and place your order</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Menu Items */}
          <div className="lg:col-span-2 space-y-6">
            {Object.entries(groupedItems).map(([category, items]) => (
              <div key={category}>
                <h3 className="text-xl font-semibold mb-3">{category}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((item) => (
                    <Card
                      key={item.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
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
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>
            ))}

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
                  Your Order
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {orderItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No items added yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {orderItems.map((item) => (
                      <div key={item.menuItem.id} className="space-y-2">
                        <div className="flex items-start gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0" 
                            onClick={() => removeFromOrder(item.menuItem.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{item.menuItem.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.quantity > 0 
                                ? `${formatPrice(item.menuItem.base_price, item.menuItem.currency)} base`
                                : "Only extra units"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => updateQuantity(item.menuItem.id, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">
                              {item.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => updateQuantity(item.menuItem.id, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        
                        {item.menuItem.per_unit_price && (
                          <div className="flex items-center gap-2 pl-2">
                            <Label className="text-xs text-muted-foreground flex-1">
                              Extra {item.menuItem.pricing_unit}s (+{formatPrice(item.menuItem.per_unit_price, item.menuItem.currency)})
                            </Label>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => updateExtraUnits(item.menuItem.id, -1)}
                              >
                                <Minus className="h-2 w-2" />
                              </Button>
                              <span className="w-6 text-center text-xs">
                                {item.extraUnits}
                              </span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => updateExtraUnits(item.menuItem.id, 1)}
                              >
                                <Plus className="h-2 w-2" />
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex justify-end">
                          <p className="font-medium text-sm">
                            {formatPrice(calculateItemTotal(item), item.menuItem.currency)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Separator />

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="customerName">Your Name *</Label>
                    <Input
                      id="customerName"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value.slice(0, 100))}
                      placeholder="John Doe"
                      className="mt-2"
                      required
                      maxLength={100}
                    />
                  </div>

                  <div>
                    <Label htmlFor="customerEmail">Your Email *</Label>
                    <Input
                      id="customerEmail"
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value.slice(0, 255))}
                      placeholder="john@example.com"
                      className="mt-2"
                      required
                      maxLength={255}
                    />
                  </div>

                  <div>
                    <Label>Payment Method</Label>
                    <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="mt-2 grid grid-cols-2 gap-2">
                      {PAYMENT_METHODS.map((method) => (
                        <div key={method} className="flex items-center space-x-2">
                          <RadioGroupItem value={method} id={`public-${method.toLowerCase()}`} />
                          <Label htmlFor={`public-${method.toLowerCase()}`} className="font-normal">
                            {method}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  <div>
                    <Label htmlFor="notes">Special Requests (Optional)</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
                      placeholder="Any special instructions..."
                      className="mt-2"
                      rows={2}
                      maxLength={1000}
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span className="text-primary">{formatPrice(calculateTotal(), currency)}</span>
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleSubmitOrder}
                    disabled={loading || orderItems.length === 0}
                  >
                    {loading ? "Processing..." : "Place Order"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicOrder;
