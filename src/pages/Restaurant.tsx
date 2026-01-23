import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowLeft, Plus, Minus, ShoppingCart, Store } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHaptics } from "@/hooks/use-haptics";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";

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

const Restaurant = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const haptics = useHaptics();
  const { restaurantId } = useRestaurantContext();
  const [restaurantName, setRestaurantName] = useState("");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState("USD");

  useEffect(() => {
    if (id) {
      fetchRestaurantData();
    }
  }, [id]);

  const fetchRestaurantData = async () => {
    try {
      // Fetch restaurant profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", id)
        .single();

      if (profileError) throw profileError;
      setRestaurantName(profile.full_name || "Restaurant");

      // Fetch menu items
      const { data: items, error: itemsError } = await supabase
        .from("menu_items")
        .select("*")
        .eq("staff_id", id)
        .eq("is_available", true)
        .order("name");

      if (itemsError) throw itemsError;
      setMenuItems(items || []);

      // Fetch restaurant settings
      const { data: settings } = await supabase
        .from("restaurant_settings")
        .select("currency")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();

      if (settings) {
        setCurrency(settings.currency);
      }
    } catch (error: any) {
      toast.error("Failed to load restaurant");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const addToOrder = (menuItem: MenuItem) => {
    if (menuItem.currency !== currency) {
      toast.error(`This item uses ${menuItem.currency} but the restaurant uses ${currency}`);
      return;
    }

    if (isMobile) haptics.tap();

    const existing = orderItems.find(item => item.menuItem.id === menuItem.id);
    if (existing) {
      setOrderItems(orderItems.map(item =>
        item.menuItem.id === menuItem.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setOrderItems([...orderItems, { menuItem, quantity: 1, extraUnits: 0 }]);
    }
  };

  const updateQuantity = (menuItemId: string, change: number) => {
    setOrderItems(
      orderItems
        .map(item =>
          item.menuItem.id === menuItemId
            ? { ...item, quantity: Math.max(0, item.quantity + change) }
            : item
        )
        .filter(item => item.quantity > 0 || item.extraUnits > 0)
    );
  };

  const updateExtraUnits = (menuItemId: string, change: number) => {
    setOrderItems(
      orderItems
        .map(item =>
          item.menuItem.id === menuItemId
            ? { ...item, extraUnits: Math.max(0, item.extraUnits + change) }
            : item
        )
        .filter(item => item.quantity > 0 || item.extraUnits > 0)
    );
  };

  const calculateItemTotal = (item: OrderItem) => {
    const baseTotal = item.menuItem.base_price * item.quantity;
    const extraTotal = (item.menuItem.per_unit_price || 0) * item.extraUnits;
    return baseTotal + extraTotal;
  };

  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  };

  const handleCheckout = async () => {
    if (orderItems.length === 0) {
      toast.error("Please add items to your order");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to place an order");
        navigate("/auth");
        return;
      }

      const total = calculateTotal();

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert([{
          staff_id: user.id,
          total,
          payment_method: "Cash",
          currency: currency,
          is_public_order: false,
          restaurant_id: restaurantId
        }])
        .select()
        .single();

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

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItemsData);

      if (itemsError) throw itemsError;

      toast.success(`Order #${order.order_number} placed successfully!`);
      navigate(`/receipt/${order.id}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to place order");
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Restaurants
          </Button>
          <div className="flex items-center gap-3">
            <Store className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">{restaurantName}</h1>
              <p className="text-muted-foreground">Browse menu and place your order</p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Menu Items */}
          <div className="lg:col-span-2">
            {menuItems.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No menu items available</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {menuItems.map(item => (
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
                    {orderItems.map(item => (
                      <div key={item.menuItem.id} className="space-y-2">
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
                            <span className="text-xs text-muted-foreground flex-1">
                              Extra {item.menuItem.pricing_unit}s
                            </span>
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

                <div className="space-y-2">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>{formatPrice(calculateTotal(), currency)}</span>
                  </div>
                  <Button
                    size="lg"
                    onClick={handleCheckout}
                    disabled={orderItems.length === 0}
                    className="w-full"
                  >
                    Place Order
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Restaurant;
