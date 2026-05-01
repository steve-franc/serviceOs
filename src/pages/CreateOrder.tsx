import { useState, useEffect, useMemo } from "react";
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
import { Plus, Minus, ShoppingCart, ChevronDown, ChevronRight, Store, ChevronUp, X, Calculator, Search, Percent, Tag, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/currency";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHaptics } from "@/hooks/use-haptics";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { useMenuItems, useMenuTags, useRestaurantSettings } from "@/hooks/useQueries";
import { staffOrderSchema, validateInput } from "@/lib/validations";
import { parsePaymentMethods, getMethodNames } from "@/lib/payment-methods";
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
  is_service?: boolean;
  service_duration_minutes?: number | null;
  advance_booking_days?: number | null;
}
interface OrderItem {
  menuItem: MenuItem;
  quantity: number;
  extraUnits: number;
  slotAt?: string;
}
const CreateOrder = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const haptics = useHaptics();
  const {
    restaurantId,
    restaurantName,
    loading: restaurantLoading
  } = useRestaurantContext();
  const { data: menuItemsData = [] } = useMenuItems(true);
  const { data: menuTags = [] } = useMenuTags();
  const { data: restaurantSettings } = useRestaurantSettings();
  const paymentMethods: string[] = getMethodNames(parsePaymentMethods(restaurantSettings?.payment_methods));
  const menuItems = menuItemsData as MenuItem[];
  // Restore persisted order from sessionStorage
  const [orderItems, setOrderItems] = useState<OrderItem[]>(() => {
    try {
      const saved = sessionStorage.getItem('pendingOrder');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.orderItems || [];
      }
    } catch {}
    return [];
  });
  const [paymentMethod, setPaymentMethod] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem('pendingOrder');
      if (saved) return JSON.parse(saved).paymentMethod || "Cash";
    } catch {}
    return "Cash";
  });
  const [notes, setNotes] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pendingOrder');
      if (saved) return JSON.parse(saved).notes || "";
    } catch {}
    return "";
  });
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">(() => {
    try {
      const saved = sessionStorage.getItem('pendingOrder');
      if (saved) return JSON.parse(saved).discountType || "percentage";
    } catch {}
    return "percentage";
  });
  const [discountValue, setDiscountValue] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem('pendingOrder');
      if (saved) return JSON.parse(saved).discountValue || "";
    } catch {}
    return "";
  });
  const [loading, setLoading] = useState(false);
  const [currency] = useState("TRY");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [amountGiven, setAmountGiven] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [bookingItem, setBookingItem] = useState<MenuItem | null>(null);

  // Persist order state to sessionStorage
  useEffect(() => {
    if (orderItems.length > 0) {
      sessionStorage.setItem('pendingOrder', JSON.stringify({ orderItems, paymentMethod, notes, discountType, discountValue }));
    } else {
      sessionStorage.removeItem('pendingOrder');
    }
  }, [orderItems, paymentMethod, notes, discountType, discountValue]);
  const addToOrder = (menuItem: MenuItem) => {
    // Validate currency matches restaurant currency
    if (menuItem.currency !== currency) {
      toast.error(`This item uses ${menuItem.currency} but the restaurant uses ${currency}`);
      return;
    }
    if (menuItem.is_service) {
      setBookingItem(menuItem);
      return;
    }
    if (isMobile) haptics.tap();
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
  const handleSlotConfirmed = (slotAt: string) => {
    if (!bookingItem) return;
    if (isMobile) haptics.tap();
    setOrderItems(prev => [
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
    setOrderItems(orderItems.map(item => item.menuItem.id === menuItemId ? {
      ...item,
      quantity: Math.max(0, item.quantity + change)
    } : item).filter(shouldKeepItem));
  };
  const updateExtraUnits = (menuItemId: string, change: number) => {
    setOrderItems(orderItems.map(item => item.menuItem.id === menuItemId ? {
      ...item,
      extraUnits: Math.max(0, item.extraUnits + change)
    } : item).filter(shouldKeepItem));
  };

  const removeFromOrder = (menuItemId: string) => {
    if (isMobile) haptics.tap();
    setOrderItems(orderItems.filter(item => item.menuItem.id !== menuItemId));
  };

  const resetOrderState = () => {
    setOrderItems([]);
    setPaymentMethod("Cash");
    setNotes("");
    setDiscountType("percentage");
    setDiscountValue("");
    setDrawerOpen(false);
    setAmountGiven("");
    sessionStorage.removeItem('pendingOrder');
  };
  const calculateItemTotal = (item: OrderItem) => {
    const baseTotal = item.menuItem.base_price * item.quantity;
    const extraTotal = (item.menuItem.per_unit_price || 0) * item.extraUnits;
    return baseTotal + extraTotal;
  };
  const calculateSubtotal = () => {
    return orderItems.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  };
  const calculateDiscountAmount = () => {
    const subtotal = calculateSubtotal();
    const val = parseFloat(discountValue);
    if (!val || val <= 0) return 0;
    if (discountType === "percentage") {
      return Math.min(subtotal, subtotal * (Math.min(val, 100) / 100));
    }
    return Math.min(subtotal, val);
  };
  const calculateTotal = () => {
    return Math.max(0, calculateSubtotal() - calculateDiscountAmount());
  };
  const handleSubmitOrder = async () => {
    if (orderItems.length === 0) {
      toast.error("Please add items to the order");
      return;
    }
    if (!restaurantId) {
      toast.error("Restaurant not selected");
      return;
    }

    // Validate order input
    const validation = validateInput(staffOrderSchema, {
      notes: notes || undefined,
      paymentMethod
    });
    if (!validation.success) {
      toast.error(validation.error);
      return;
    }
    setLoading(true);
    try {
      const itemsPayload = orderItems.map(item => ({
        menu_item_id: item.menuItem.id,
        quantity: item.quantity,
        extra_units: item.extraUnits,
        slot_at: item.slotAt ?? null,
      }));

      const { data, error } = await (supabase as any).rpc("create_staff_order", {
        _restaurant_id: restaurantId,
        _payment_method: paymentMethod,
        _notes: notes || null,
        _discount_amount: calculateDiscountAmount(),
        _customer_name: null,
        _items: itemsPayload,
        _payment_status: "paid",
      });
      if (error) throw error;

      const created = Array.isArray(data) ? data[0] : data;
      if (!created?.id) throw new Error("Order was not created");

      toast.success(`Order #${created.order_number} created successfully!`);
      resetOrderState();
      navigate(`/receipt/${created.id}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to create order");
    } finally {
      setLoading(false);
    }
  };
  // Build set of categories for selected tags
  const taggedCategories = useMemo(() => {
    if (selectedTags.size === 0) return null;
    const cats = new Set<string>();
    (menuTags as any[]).forEach(tag => {
      if (selectedTags.has(tag.name) && tag.category) {
        cats.add(tag.category);
      }
    });
    return cats;
  }, [selectedTags, menuTags]);

  const filteredItems = useMemo(() => {
    let items = menuItems;
    // Filter by tags (via categories)
    if (taggedCategories && taggedCategories.size > 0) {
      items = items.filter(item =>
        item.category && taggedCategories.has(item.category)
      );
    }
    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(item =>
        item.name.toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q))
      );
    }
    return items;
  }, [menuItems, searchQuery, taggedCategories]);

  const groupedByCategory = filteredItems.reduce((acc, item) => {
    const category = item.category || "Uncategorized";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  // Auto-expand all categories when searching
  const isSearching = searchQuery.trim().length > 0 || selectedTags.size > 0;

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  // Order summary content - extracted as JSX to avoid re-creating component on each render
  const orderSummaryContent = (
    <div className="space-y-4">
      {orderItems.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          No items added yet
        </p>
      ) : (
        <div className="space-y-3">
          {orderItems.map(item => (
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
                    <span className="w-8 text-center text-sm font-medium">
                      {item.quantity}
                    </span>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.menuItem.id, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              
              {!item.slotAt && item.menuItem.per_unit_price && (
                <div className="flex items-center gap-2 pl-2">
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
          <Label>Payment Method</Label>
          <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="mt-2 grid grid-cols-2 gap-2">
            {paymentMethods.map(method => (
              <div key={method} className="flex items-center space-x-2">
                <RadioGroupItem value={method} id={method.toLowerCase()} />
                <Label htmlFor={method.toLowerCase()} className="font-normal">
                  {method}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div>
          <Label htmlFor="notes">Notes (Optional)</Label>
          <Textarea 
            id="notes" 
            value={notes} 
            onChange={e => setNotes(e.target.value.slice(0, 1000))} 
            placeholder="Special instructions..." 
            className="mt-2" 
            rows={2} 
            maxLength={1000}
          />
        </div>
      </div>

      <Separator />

      {/* Discount */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Tag className="h-3.5 w-3.5" />
          Discount
        </Label>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-input overflow-hidden">
            <button
              type="button"
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${discountType === "percentage" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
              onClick={() => setDiscountType("percentage")}
            >
              <Percent className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${discountType === "fixed" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
              onClick={() => setDiscountType("fixed")}
            >
              ₺
            </button>
          </div>
          <Input
            type="number"
            placeholder={discountType === "percentage" ? "0%" : "0.00"}
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            className="h-8 text-sm max-w-24"
            min={0}
            max={discountType === "percentage" ? 100 : undefined}
            step={discountType === "percentage" ? 1 : 0.01}
          />
          {calculateDiscountAmount() > 0 && (
            <span className="text-sm text-destructive font-medium">
              -{formatPrice(calculateDiscountAmount(), currency)}
            </span>
          )}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        {calculateDiscountAmount() > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatPrice(calculateSubtotal(), currency)}</span>
          </div>
        )}
        {calculateDiscountAmount() > 0 && (
          <div className="flex justify-between text-sm text-destructive">
            <span>Discount</span>
            <span>-{formatPrice(calculateDiscountAmount(), currency)}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-bold">
          <span>Total</span>
          <span className="text-primary">{formatPrice(calculateTotal(), currency)}</span>
        </div>

        {/* Change Calculator */}
        {orderItems.length > 0 && (
          <div className="flex items-center gap-2 py-2">
            <Calculator className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              type="number"
              placeholder="Amount given"
              value={amountGiven}
              onChange={(e) => setAmountGiven(e.target.value)}
              className="max-w-28 h-8 text-sm"
              min={0}
              step="0.01"
            />
            {amountGiven && !isNaN(parseFloat(amountGiven)) && (
              <div className="flex items-center gap-1 text-sm">
                <span className="text-muted-foreground">Change:</span>
                <span className={`font-bold ${parseFloat(amountGiven) - calculateTotal() >= 0 ? "text-green-600" : "text-destructive"}`}>
                  {formatPrice(Math.abs(parseFloat(amountGiven) - calculateTotal()), currency)}
                  {parseFloat(amountGiven) - calculateTotal() < 0 && " short"}
                </span>
              </div>
            )}
          </div>
        )}

        <Button size="lg" onClick={handleSubmitOrder} disabled={loading || orderItems.length === 0} className="w-full">
          {loading ? "Processing..." : "Complete Order"}
        </Button>
      </div>
    </div>
  );
  return <Layout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Store className="h-6 w-6 text-primary" />
            <h2 className="text-3xl font-bold">{restaurantName || "Create Order"}</h2>
          </div>
          <p className="text-muted-foreground">Select items to add to the order</p>
            </div>

            {/* Tag Filter */}
            {menuTags.length > 0 && (() => {
              const uniqueNames = [...new Set((menuTags as any[]).map(t => t.name))].sort();
              return (
                <div className="flex flex-wrap gap-2">
                  {uniqueNames.map((name: string) => {
                    const isActive = selectedTags.has(name);
                    return (
                      <Badge
                        key={name}
                        variant={isActive ? "default" : "outline"}
                        className="cursor-pointer select-none"
                        onClick={() => {
                          const next = new Set(selectedTags);
                          if (isActive) next.delete(name);
                          else next.add(name);
                          setSelectedTags(next);
                        }}
                      >
                        {name}
                      </Badge>
                    );
                  })}
                  {selectedTags.size > 0 && (
                    <Badge
                      variant="outline"
                      className="cursor-pointer text-destructive border-destructive/50"
                      onClick={() => setSelectedTags(new Set())}
                    >
                      Clear
                    </Badge>
                  )}
                </div>
              );
            })()}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Menu Items - Grouped by Category */}
          <div className="lg:col-span-2 space-y-4 pb-20 md:pb-0">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search menu items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {Object.entries(groupedByCategory).map(([category, items]) => {
              const isExpanded = isSearching || expandedCategories.has(category);
              return (
                <Card key={category}>
                  <Collapsible open={isExpanded} onOpenChange={() => toggleCategory(category)}>
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="text-left">
                            <CardTitle className="text-lg">{category}</CardTitle>
                            <CardDescription className="text-sm">
                              {items.length} {items.length === 1 ? 'item' : 'items'} available
                            </CardDescription>
                          </div>
                          {isExpanded ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                          {items.map(item => (
                            <Card key={item.id} className="cursor-pointer hover:shadow-md transition-shadow border-2" onClick={() => addToOrder(item)}>
                              <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                  <CardTitle className="text-base">{item.name}</CardTitle>
                                  <div className="flex flex-col items-end gap-1">
                                    <Badge variant="secondary">
                                      {formatPrice(item.base_price, item.currency)}
                                    </Badge>
                                    {item.is_service ? (
                                      <Badge variant="outline" className="text-xs">
                                        <Clock className="h-3 w-3 mr-1" />
                                        {item.service_duration_minutes ?? 60} min
                                      </Badge>
                                    ) : item.per_unit_price && (
                                      <Badge variant="outline" className="text-xs">
                                        +{formatPrice(item.per_unit_price, item.currency)} / {item.pricing_unit}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                {item.description && <CardDescription className="text-sm">{item.description}</CardDescription>}
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

            {filteredItems.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">
                    {searchQuery ? "No items match your search" : "No menu items available"}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Order Summary - Desktop */}
          {!isMobile && (
            <div className="lg:col-span-1">
              <Card className="sticky top-0 max-h-[calc(100vh-3.5rem-3rem)] flex flex-col">
                <CardHeader className="shrink-0">
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5" />
                    Current Order
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-y-auto flex-1">
                  {orderSummaryContent}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Mobile Drawer */}
        {isMobile && <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DrawerTrigger asChild>
              <Button className="fixed bottom-4 left-4 right-4 z-50 h-14 shadow-lg" size="lg">
                <ShoppingCart className="h-5 w-5 mr-2" />
                <span className="flex-1 text-left">Current Order</span>
                {orderItems.length > 0 && <Badge variant="secondary" className="ml-2">
                    {orderItems.length}
                  </Badge>}
                <span className="ml-2 font-bold">{formatPrice(calculateTotal(), currency)}</span>
                <ChevronUp className="h-5 w-5 ml-2" />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="max-h-[85vh]">
              <DrawerHeader>
                <DrawerTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Current Order
                </DrawerTitle>
              </DrawerHeader>
              <div className="px-4 pb-6 overflow-y-auto">
                {orderSummaryContent}
              </div>
            </DrawerContent>
          </Drawer>}
      </div>
    </Layout>;
};
export default CreateOrder;