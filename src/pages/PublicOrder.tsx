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
import { Plus, Minus, ShoppingCart, UtensilsCrossed, X, Clock, ChevronUp } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/currency";
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
  const { restaurantId: urlRestaurantId } = useParams<{ restaurantId: string }>();
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
  const [currency, setCurrency] = useState("TRY");
  const [restaurantId, setRestaurantId] = useState<string | null>(urlRestaurantId || null);
  const [publicOrdersDisabled, setPublicOrdersDisabled] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      .select("restaurant_id, restaurant_name, allow_public_orders")
      .eq("restaurant_id", urlRestaurantId!)
      .maybeSingle();

    if (data) {
      setRestaurantName(data.restaurant_name);
      setCurrency("TRY");
      setRestaurantId(data.restaurant_id ?? null);
      if (!data.allow_public_orders) {
        setPublicOrdersDisabled(true);
      }
    } else {
      // Try to get restaurant name directly
      const { data: restaurant } = await supabase
        .from("restaurants")
        .select("name")
        .eq("id", urlRestaurantId!)
        .maybeSingle();
      if (restaurant) {
        setRestaurantName(restaurant.name);
      }
    }
    setPageLoading(false);
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
      customerEmail: customerEmail || undefined,
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
      }));

      const { data: order, error: orderError } = await supabase.rpc("create_public_order", {
        _restaurant_id: restaurantId,
        _customer_name: validatedData.customerName,
        _customer_email: validatedData.customerEmail || null,
        _payment_method: validatedData.paymentMethod,
        _notes: validatedData.notes || null,
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
  const groupedItems = menuItems.reduce((acc, item) => {
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

          {/* Order Summary - Desktop only */}
          {!isMobile && (
            <div className="lg:col-span-1">
              <Card className="sticky top-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5" />
                    Your Order
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
    </div>
  );
};

export default PublicOrder;
