import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Plus, Minus, ShoppingCart, UtensilsCrossed, X, Clock, ChevronUp, ChevronDown, ChevronRight, Search, ImageIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/currency";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHaptics } from "@/hooks/use-haptics";
import { publicOrderSchema, validateInput } from "@/lib/validations";
import { PaymentMethodConfig, parsePaymentMethods } from "@/lib/payment-methods";
import { BookSlotDialog } from "@/components/BookSlotDialog";
import { format } from "date-fns";
interface MenuItem {
  id: string;
  name: string;
  category: string | null;
  base_price: number;
  per_unit_price: number | null;
  description: string | null;
  pricing_unit: string;
  currency: string;
  image_url: string | null;
  is_service?: boolean;
  service_duration_minutes?: number | null;
  advance_booking_days?: number | null;
}

interface OrderItem {
  menuItem: MenuItem;
  quantity: number;
  extraUnits: number;
  slotAt?: string; // ISO timestamp for service bookings
}

const PublicOrder = () => {
  const navigate = useNavigate();
  const { restaurantId: urlRestaurantId } = useParams<{ restaurantId: string }>();
  const isMobile = useIsMobile();
  const haptics = useHaptics();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [notes, setNotes] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerLocation, setCustomerLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [restaurantName, setRestaurantName] = useState("Restaurant");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [currency, setCurrency] = useState("TRY");
  const [restaurantId, setRestaurantId] = useState<string | null>(urlRestaurantId || null);
  const [publicOrdersDisabled, setPublicOrdersDisabled] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [bookingItem, setBookingItem] = useState<MenuItem | null>(null);

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  useEffect(() => {
    if (!urlRestaurantId) {
      setPageLoading(false);
      return;
    }
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlRestaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    fetchMenuItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("restaurant_settings")
      .select("restaurant_id, restaurant_name, allow_public_orders, payment_methods, logo_url")
      .eq("restaurant_id", urlRestaurantId!)
      .maybeSingle();

    // Check restaurant status — only 'active' restaurants accept public orders
    const { data: restaurantRow } = await supabase
      .from("restaurants")
      .select("name, status")
      .eq("id", urlRestaurantId!)
      .maybeSingle();

    if (data) {
      setRestaurantName(data.restaurant_name);
      setLogoUrl((data as any).logo_url ?? null);
      setCurrency("TRY");
      setRestaurantId(data.restaurant_id ?? null);
      const methods = parsePaymentMethods(data.payment_methods);
      setAvailablePaymentMethods(methods);
      setPaymentMethod(methods[0]?.name || "Cash");
      if (!data.allow_public_orders || (restaurantRow && (restaurantRow as any).status !== "active")) {
        setPublicOrdersDisabled(true);
      }
    } else if (restaurantRow) {
      setRestaurantName(restaurantRow.name);
      if ((restaurantRow as any).status !== "active") setPublicOrdersDisabled(true);
    }
    setPageLoading(false);
  };

  const fetchMenuItems = async () => {
    if (!restaurantId) return;
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("is_available", true)
      .eq("is_public", true)
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
    if (menuItem.is_service) {
      // Open booking dialog instead of incrementing quantity
      setBookingItem(menuItem);
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

  const handleSlotConfirmed = (slotAt: string) => {
    if (!bookingItem) return;
    if (isMobile) haptics.tap();
    setOrderItems((prev) => [
      ...prev,
      { menuItem: bookingItem, quantity: 1, extraUnits: 0, slotAt },
    ]);
    setBookingItem(null);
    toast.success(`${bookingItem.name} booked for ${format(new Date(slotAt), "EEE d MMM, HH:mm")}`);
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
    setCustomerPhone("");
    setCustomerLocation("");
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
      customerEmail: customerEmail || undefined,
      customerPhone,
      customerLocation,
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
      if (!restaurantId) throw new Error("Restaurant not configured");

      const payloadItems = orderItems.map((item) => ({
        menu_item_id: item.menuItem.id,
        quantity: item.quantity,
        extra_units: item.extraUnits,
        slot_at: item.slotAt ?? null,
      }));

      const customerInfoLines = [
        `name: ${validatedData.customerName}`,
        "",
        `phone number: ${validatedData.customerPhone || ""}`,
        "",
        `location: ${validatedData.customerLocation || ""}`,
      ];
      const composedNotes = [
        ...customerInfoLines,
        ...(validatedData.notes ? ["", validatedData.notes] : []),
      ].join("\n");

      const { data: order, error: orderError } = await supabase.rpc("create_public_order", {
        _restaurant_id: restaurantId,
        _customer_name: validatedData.customerName,
        _customer_email: validatedData.customerEmail || null,
        _customer_phone: validatedData.customerPhone || null,
        _customer_location: validatedData.customerLocation || null,
        _payment_method: validatedData.paymentMethod,
        _notes: composedNotes,
        _items: payloadItems,
      });

      if (orderError) throw orderError;

      const createdOrder = Array.isArray(order) ? order[0] : order;
      if (!createdOrder?.id) throw new Error("Failed to create order");

      toast.success(`Order #${createdOrder.order_number} placed successfully!`);
      resetOrderState();
      navigate(`/receipt/${createdOrder.id}?pending=true`);
    } catch (error: any) {
      toast.error(error.message || "Failed to place order");
    } finally {
      setLoading(false);
    }
  };

  const EXCLUDED_CATEGORIES = ['misc', 'utility', 'miscellaneous'];
  const isSearching = searchQuery.trim().length > 0;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredMenuItems = isSearching
    ? menuItems.filter((item) => {
        const haystack = `${item.name} ${item.category || ""} ${item.description || ""}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : menuItems;
  const groupedItems = filteredMenuItems.reduce((acc, item) => {
    const category = item.category || "Other";
    if (EXCLUDED_CATEGORIES.includes(category.toLowerCase())) return acc;
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading menu...</p>
      </div>
    );
  }

  if (!urlRestaurantId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Invalid ordering link. Please ask the restaurant for their ordering URL.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (publicOrdersDisabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardContent className="py-12 text-center space-y-2">
            <UtensilsCrossed className="h-10 w-10 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">{restaurantName}</h2>
            <p className="text-muted-foreground">Online ordering is currently unavailable for this restaurant.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const orderSummaryContent = (
    <div className="space-y-4">
      {orderItems.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          No items added yet
        </p>
      ) : (
        <div className="space-y-3">
          {orderItems.map((item) => (
            <div key={item.menuItem.id} className="space-y-2">
              <div className="flex items-start gap-2">
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeFromOrder(item.menuItem.id)}>
                  <X className="h-4 w-4" />
                </Button>
                <div className="flex-1">
                  <p className="font-medium text-sm">{item.menuItem.name}</p>
                  {item.slotAt ? (
                    <p className="text-xs text-primary">
                      {format(new Date(item.slotAt), "EEE d MMM · HH:mm")}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {item.quantity > 0 ? `${formatPrice(item.menuItem.base_price, item.menuItem.currency)} base` : "Only extra units"}
                    </p>
                  )}
                </div>
                {!item.slotAt && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.menuItem.id, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.menuItem.id, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              {item.menuItem.per_unit_price && (
                <div className="flex items-center gap-2 pl-2">
                  <Label className="text-xs text-muted-foreground flex-1">
                    Extra {item.menuItem.pricing_unit}s (+{formatPrice(item.menuItem.per_unit_price, item.menuItem.currency)})
                  </Label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateExtraUnits(item.menuItem.id, -1)}>
                      <Minus className="h-2 w-2" />
                    </Button>
                    <span className="w-6 text-center text-xs">{item.extraUnits}</span>
                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateExtraUnits(item.menuItem.id, 1)}>
                      <Plus className="h-2 w-2" />
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex justify-end">
                <p className="font-medium text-sm">{formatPrice(calculateItemTotal(item), item.menuItem.currency)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Separator />

      <div className="space-y-3">
        <div>
          <Label htmlFor="customerName">Your Name *</Label>
          <Input id="customerName" value={customerName} onChange={(e) => setCustomerName(e.target.value.slice(0, 100))} placeholder="John Doe" className="mt-2" required maxLength={100} />
        </div>
        <div>
          <Label htmlFor="customerPhone">Phone Number *</Label>
          <Input id="customerPhone" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value.slice(0, 30))} placeholder="+90 555 123 4567" className="mt-2" required maxLength={30} />
        </div>
        <div>
          <Label htmlFor="customerLocation">Location / Address *</Label>
          <Input id="customerLocation" value={customerLocation} onChange={(e) => setCustomerLocation(e.target.value.slice(0, 300))} placeholder="Your delivery address" className="mt-2" required maxLength={300} />
        </div>
        <div>
          <Label htmlFor="customerEmail">Your Email (Optional)</Label>
          <Input id="customerEmail" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value.slice(0, 255))} placeholder="john@example.com" className="mt-2" maxLength={255} />
        </div>
        <div>
          <Label>Payment Method</Label>
          <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="mt-2 grid grid-cols-2 gap-2">
            {availablePaymentMethods.map((method) => {
              const selected = paymentMethod === method.name;
              return (
                <Label
                  key={method.name}
                  htmlFor={`public-${method.name.toLowerCase()}`}
                  className={`flex items-center gap-2 rounded-md border p-3 cursor-pointer transition-colors font-normal ${
                    selected ? "border-primary bg-primary/5" : "border-input hover:bg-muted/50"
                  }`}
                >
                  <RadioGroupItem value={method.name} id={`public-${method.name.toLowerCase()}`} />
                  <span className="text-sm flex-1 truncate">
                    {method.name}
                    {method.currency !== "TRY" && (
                      <span className="text-xs text-muted-foreground ml-1">({method.currency})</span>
                    )}
                  </span>
                </Label>
              );
            })}
          </RadioGroup>

          {/* Show selected method details */}
          {(() => {
            const selected = availablePaymentMethods.find(m => m.name === paymentMethod);
            if (!selected || (selected.conversion_rate === 1 && !selected.account_number)) return null;
            const total = calculateTotal();
            const converted = total * selected.conversion_rate;
            return (
              <div className="mt-3 p-3 rounded-lg bg-muted/50 space-y-1">
                {selected.conversion_rate !== 1 && (
                  <p className="text-sm font-medium">
                    Converted: <span className="text-primary">{converted.toFixed(2)} {selected.currency}</span>
                  </p>
                )}
                {selected.account_number && (
                  <div>
                    <p className="text-xs text-muted-foreground">Pay to:</p>
                    <p className="text-sm font-mono select-all break-all">{selected.account_number}</p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
        <div>
          <Label htmlFor="notes">Special Requests (Optional)</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 1000))} placeholder="Any special instructions..." className="mt-2" rows={2} maxLength={1000} />
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex justify-between text-lg font-bold">
          <span>Total</span>
          <span className="text-primary">{formatPrice(calculateTotal(), currency)}</span>
        </div>
        {(() => {
          const selected = availablePaymentMethods.find(m => m.name === paymentMethod);
          if (selected && selected.conversion_rate !== 1) {
            const converted = calculateTotal() * selected.conversion_rate;
            return (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>In {selected.currency}</span>
                <span>{converted.toFixed(2)} {selected.currency}</span>
              </div>
            );
          }
          return null;
        })()}
        <Button className="w-full" size="lg" onClick={handleSubmitOrder} disabled={loading || orderItems.length === 0}>
          {loading ? "Processing..." : "Place Order"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-accent text-primary-foreground py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-full bg-primary-foreground/20 flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt={restaurantName} className="h-full w-full object-cover" />
              ) : (
                <UtensilsCrossed className="h-6 w-6" />
              )}
            </div>
            <h1 className="text-3xl font-bold">{restaurantName}</h1>
          </div>
          <p className="text-primary-foreground/90">Browse our menu and place your order</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Menu Items */}
          <div className="lg:col-span-2 space-y-6 pb-20 md:pb-0">
            {menuItems.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search menu items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.slice(0, 100))}
                  className="pl-9"
                />
              </div>
            )}
            {Object.entries(groupedItems).map(([category, items]) => {
              const isOpen = isSearching || !collapsedCategories.has(category);
              return (
                <Collapsible key={category} open={isOpen} onOpenChange={() => !isSearching && toggleCategory(category)}>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 px-1 hover:bg-muted/50 rounded-md transition-colors">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <h3 className="text-xl font-semibold">{category}</h3>
                    <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 mt-3">
                      {items.map((item) => (
                        <Card
                          key={item.id}
                          className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden group"
                          onClick={() => addToOrder(item)}
                        >
                          <div className="relative aspect-square bg-muted overflow-hidden">
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.name}
                                loading="lazy"
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                <ImageIcon className="h-10 w-10" />
                              </div>
                            )}
                            <div className="absolute bottom-2 right-2 bg-primary text-primary-foreground rounded-full p-1.5 shadow-md opacity-90 group-hover:opacity-100 group-active:scale-90 transition-all">
                              {item.is_service ? <Clock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                            </div>
                          </div>
                          <div className="p-2.5 space-y-1">
                            <h4 className="font-medium text-sm leading-tight line-clamp-2">{item.name}</h4>
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-sm font-semibold text-primary">
                                {formatPrice(item.base_price, item.currency)}
                              </span>
                              {item.is_service ? (
                                <span className="text-[10px] text-muted-foreground">
                                  · {item.service_duration_minutes ?? 60} min
                                </span>
                              ) : item.per_unit_price && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{formatPrice(item.per_unit_price, item.currency)}/{item.pricing_unit}
                                </span>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}

            {menuItems.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No menu items available</p>
                </CardContent>
              </Card>
            )}
            {menuItems.length > 0 && Object.keys(groupedItems).length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No items match "{searchQuery}"</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Order Summary - Desktop only */}
          {!isMobile && (
            <div className="lg:col-span-1">
              <Card className="sticky top-6 max-h-[calc(100vh-3rem)] flex flex-col">
                <CardHeader className="shrink-0">
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5" />
                    Your Order
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 overflow-y-auto flex-1">
                  {orderSummaryContent}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Drawer */}
      {isMobile && (
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerTrigger asChild>
            <Button className="fixed bottom-4 left-4 right-4 z-50 h-14 shadow-lg" size="lg">
              <ShoppingCart className="h-5 w-5 mr-2" />
              <span className="flex-1 text-left">Your Order</span>
              {orderItems.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {orderItems.length}
                </Badge>
              )}
              <span className="ml-2 font-bold">{formatPrice(calculateTotal(), currency)}</span>
              <ChevronUp className="h-5 w-5 ml-2" />
            </Button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader>
              <DrawerTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Your Order
              </DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-6 overflow-y-auto">
              {orderSummaryContent}
            </div>
          </DrawerContent>
        </Drawer>
      )}
      {bookingItem && (
        <BookSlotDialog
          open={!!bookingItem}
          onOpenChange={(o) => !o && setBookingItem(null)}
          menuItemId={bookingItem.id}
          menuItemName={bookingItem.name}
          durationMinutes={bookingItem.service_duration_minutes ?? 60}
          advanceDays={bookingItem.advance_booking_days ?? 30}
          onConfirm={handleSlotConfirmed}
        />
      )}
    </div>
  );
};

export default PublicOrder;
