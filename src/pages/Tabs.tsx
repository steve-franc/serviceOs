import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Minus, X, ChevronDown, ChevronRight, ChevronUp,
  Receipt, Clock, ArrowLeft, ShoppingCart, CreditCard,
} from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHaptics } from "@/hooks/use-haptics";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { useTabs, useInvalidateTabs, useMenuItems, useRestaurantSettings } from "@/hooks/useQueries";
import { parsePaymentMethods, getMethodNames } from "@/lib/payment-methods";

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

interface TabItem {
  id: string;
  menu_item_id: string;
  menu_item_name: string;
  quantity: number;
  extra_units: number;
  base_price_at_time: number;
  per_unit_price_at_time: number | null;
  subtotal: number;
  added_at: string;
}

interface Tab {
  id: string;
  restaurant_id: string;
  staff_id: string;
  customer_name: string | null;
  notes: string | null;
  currency: string;
  status: string;
  total: number;
  created_at: string;
  closed_at: string | null;
  payment_method: string | null;
}

// ── List View ────────────────────────────────────────────────
const TabsList = ({
  tabs,
  loading,
  onOpenTab,
  onNewTab,
}: {
  tabs: Tab[];
  loading: boolean;
  onOpenTab: (tab: Tab) => void;
  onNewTab: () => void;
}) => {
  const openTabs = tabs.filter((t) => t.status === "open");

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-bold">Tabs</h2>
          <p className="text-muted-foreground">Running orders for customers</p>
        </div>
        <Button onClick={onNewTab}>
          <Plus className="h-4 w-4 mr-2" />
          Open Tab
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-center py-12">Loading…</p>
      ) : openTabs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No open tabs</p>
            <Button onClick={onNewTab} variant="outline" className="mt-4">
              <Plus className="h-4 w-4 mr-2" />
              Open a tab
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {openTabs.map((tab) => (
            <Card
              key={tab.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => onOpenTab(tab)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    {tab.customer_name || "Unnamed Tab"}
                  </CardTitle>
                  <Badge variant="secondary">
                    {formatPrice(tab.total)}
                  </Badge>
                </div>
                <CardDescription className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Opened {new Date(tab.created_at).toLocaleString()}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Detail View ──────────────────────────────────────────────
const TabDetail = ({
  tab,
  onBack,
  onClosed,
  restaurantId,
}: {
  tab: Tab;
  onBack: () => void;
  onClosed: () => void;
  restaurantId: string;
}) => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const haptics = useHaptics();
  const { data: restaurantSettings } = useRestaurantSettings();
  const paymentMethods: string[] = getMethodNames(parsePaymentMethods(restaurantSettings?.payment_methods));

  const [tabItems, setTabItems] = useState<TabItem[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showAddItems, setShowAddItems] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [closing, setClosing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Pending items to add (not yet saved)
  const [pendingItems, setPendingItems] = useState<
    { menuItem: MenuItem; quantity: number; extraUnits: number }[]
  >([]);

  useEffect(() => {
    fetchTabItems();
    fetchMenuItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTabItems = async () => {
    const { data, error } = await supabase
      .from("tab_items")
      .select("*")
      .eq("tab_id", tab.id)
      .order("added_at", { ascending: true });
    if (error) {
      toast.error("Failed to load tab items");
      return;
    }
    setTabItems(data || []);
  };

  const fetchMenuItems = async () => {
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("is_available", true)
      .eq("restaurant_id", restaurantId)
      .order("category")
      .order("name");
    if (error) return;
    setMenuItems(data || []);
  };

  const groupedByCategory = menuItems.reduce((acc, item) => {
    const cat = item.category || "Uncategorized";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  const toggleCategory = (cat: string) => {
    const next = new Set(expandedCategories);
    next.has(cat) ? next.delete(cat) : next.add(cat);
    setExpandedCategories(next);
  };

  // ── Pending item helpers ──
  const addPending = (menuItem: MenuItem) => {
    if (isMobile) haptics.tap();
    const existing = pendingItems.find((p) => p.menuItem.id === menuItem.id);
    if (existing) {
      setPendingItems(
        pendingItems.map((p) =>
          p.menuItem.id === menuItem.id ? { ...p, quantity: p.quantity + 1 } : p
        )
      );
    } else {
      setPendingItems([...pendingItems, { menuItem, quantity: 1, extraUnits: 0 }]);
    }
  };

  const updatePendingQty = (id: string, change: number) => {
    setPendingItems(
      pendingItems
        .map((p) =>
          p.menuItem.id === id ? { ...p, quantity: Math.max(0, p.quantity + change) } : p
        )
        .filter((p) => p.quantity > 0 || p.extraUnits > 0)
    );
  };

  const updatePendingExtra = (id: string, change: number) => {
    setPendingItems(
      pendingItems
        .map((p) =>
          p.menuItem.id === id ? { ...p, extraUnits: Math.max(0, p.extraUnits + change) } : p
        )
        .filter((p) => p.quantity > 0 || p.extraUnits > 0)
    );
  };

  const removePending = (id: string) => {
    if (isMobile) haptics.tap();
    setPendingItems(pendingItems.filter((p) => p.menuItem.id !== id));
  };

  const calcPendingSubtotal = (p: { menuItem: MenuItem; quantity: number; extraUnits: number }) =>
    p.menuItem.base_price * p.quantity + (p.menuItem.per_unit_price || 0) * p.extraUnits;

  const pendingTotal = pendingItems.reduce((s, p) => s + calcPendingSubtotal(p), 0);

  // ── Save pending items to tab ──
  const savePendingItems = async () => {
    if (pendingItems.length === 0) return;
    const rows = pendingItems.map((p) => ({
      tab_id: tab.id,
      menu_item_id: p.menuItem.id,
      menu_item_name: p.menuItem.name,
      quantity: p.quantity,
      extra_units: p.extraUnits,
      base_price_at_time: p.menuItem.base_price,
      per_unit_price_at_time: p.menuItem.per_unit_price,
      subtotal: calcPendingSubtotal(p),
    }));

    const { error } = await supabase.from("tab_items").insert(rows);
    if (error) {
      toast.error("Failed to add items");
      return;
    }

    // Update running total
    const newTotal = runningTotal + pendingTotal;
    await supabase.from("tabs").update({ total: newTotal }).eq("id", tab.id);

    toast.success(`${pendingItems.length} item(s) added to tab`);
    setPendingItems([]);
    setShowAddItems(false);
    setDrawerOpen(false);
    fetchTabItems();
  };

  // ── Remove saved item from tab ──
  const removeSavedItem = async (item: TabItem) => {
    const { error } = await supabase.from("tab_items").delete().eq("id", item.id);
    if (error) {
      toast.error("Failed to remove item");
      return;
    }
    const newTotal = runningTotal - item.subtotal;
    await supabase.from("tabs").update({ total: Math.max(0, newTotal) }).eq("id", tab.id);
    toast.success("Item removed");
    fetchTabItems();
  };

  const runningTotal = tabItems.reduce((s, i) => s + i.subtotal, 0);

  // ── Close tab → create order ──
  const handleCloseTab = async () => {
    setClosing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const allItems = tabItems;
      if (allItems.length === 0) {
        toast.error("No items on this tab");
        setClosing(false);
        return;
      }

      const total = allItems.reduce((s, i) => s + i.subtotal, 0);

      // Create order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          staff_id: user.id,
          total,
          payment_method: paymentMethod,
          notes: tab.notes || null,
          currency: tab.currency,
          is_public_order: false,
          restaurant_id: restaurantId,
          order_number: "",
          customer_name: tab.customer_name || null,
        })
        .select()
        .single();
      if (orderError) throw orderError;

      // Create order items
      const orderItemsData = allItems.map((item) => ({
        order_id: order.id,
        menu_item_id: item.menu_item_id,
        menu_item_name: item.menu_item_name,
        quantity: item.quantity,
        extra_units: item.extra_units,
        base_price_at_time: item.base_price_at_time,
        per_unit_price_at_time: item.per_unit_price_at_time,
        price_at_time: item.base_price_at_time,
        subtotal: item.subtotal,
      }));
      const { error: itemsError } = await supabase.from("order_items").insert(orderItemsData);
      if (itemsError) throw itemsError;

      // Close the tab
      await supabase
        .from("tabs")
        .update({ status: "closed", closed_at: new Date().toISOString(), payment_method: paymentMethod, total })
        .eq("id", tab.id);

      toast.success(`Tab closed — Order #${order.order_number} created`);
      setCloseDialogOpen(false);
      navigate(`/receipt/${order.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to close tab");
    } finally {
      setClosing(false);
    }
  };

  // ── Add‑items mode ──
  if (showAddItems) {
    const pendingSummary = (
      <div className="space-y-4">
        {pendingItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Tap items to add them</p>
        ) : (
          <div className="space-y-3">
            {pendingItems.map((p) => (
              <div key={p.menuItem.id} className="space-y-2">
                <div className="flex items-start gap-2">
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removePending(p.menuItem.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{p.menuItem.name}</p>
                    <p className="text-xs text-muted-foreground">{formatPrice(p.menuItem.base_price)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updatePendingQty(p.menuItem.id, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">{p.quantity}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updatePendingQty(p.menuItem.id, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {p.menuItem.per_unit_price && (
                  <div className="flex items-center gap-2 pl-2">
                    <Label className="text-xs text-muted-foreground flex-1">
                      Extra {p.menuItem.pricing_unit}s (+{formatPrice(p.menuItem.per_unit_price)})
                    </Label>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updatePendingExtra(p.menuItem.id, -1)}>
                        <Minus className="h-2 w-2" />
                      </Button>
                      <span className="w-6 text-center text-xs">{p.extraUnits}</span>
                      <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updatePendingExtra(p.menuItem.id, 1)}>
                        <Plus className="h-2 w-2" />
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex justify-end">
                  <p className="font-medium text-sm">{formatPrice(calcPendingSubtotal(p))}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <Separator />
        <div className="flex justify-between font-bold">
          <span>Adding</span>
          <span className="text-primary">{formatPrice(pendingTotal)}</span>
        </div>
        <Button className="w-full" disabled={pendingItems.length === 0} onClick={savePendingItems}>
          Add {pendingItems.length} item(s) to Tab
        </Button>
      </div>
    );

    return (
      <Layout>
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <Button variant="ghost" size="sm" onClick={() => { setShowAddItems(false); setPendingItems([]); }}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to tab
            </Button>
            <h2 className="text-2xl font-bold mt-2">Add Items — {tab.customer_name || "Tab"}</h2>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4 pb-20 md:pb-0">
              {Object.entries(groupedByCategory).map(([category, items]) => {
                const isExpanded = expandedCategories.has(category);
                return (
                  <Card key={category}>
                    <Collapsible open={isExpanded} onOpenChange={() => toggleCategory(category)}>
                      <CollapsibleTrigger className="w-full">
                        <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="text-left">
                              <CardTitle className="text-lg">{category}</CardTitle>
                              <CardDescription className="text-sm">{items.length} item(s)</CardDescription>
                            </div>
                            {isExpanded ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0">
                          <div className="grid gap-3 sm:grid-cols-2">
                            {items.map((item) => (
                              <Card key={item.id} className="cursor-pointer hover:shadow-md transition-shadow border-2" onClick={() => addPending(item)}>
                                <CardHeader className="pb-3">
                                  <div className="flex items-start justify-between">
                                    <CardTitle className="text-base">{item.name}</CardTitle>
                                    <div className="flex flex-col items-end gap-1">
                                      <Badge variant="secondary">{formatPrice(item.base_price)}</Badge>
                                      {item.per_unit_price && (
                                        <Badge variant="outline" className="text-xs">+{formatPrice(item.per_unit_price)} / {item.pricing_unit}</Badge>
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
            </div>

            {/* Desktop summary */}
            {!isMobile && (
              <div className="lg:col-span-1">
                <Card className="sticky top-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShoppingCart className="h-5 w-5" />
                      Items to Add
                    </CardTitle>
                  </CardHeader>
                  <CardContent>{pendingSummary}</CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* Mobile drawer */}
          {isMobile && (
            <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
              <DrawerTrigger asChild>
                <Button className="fixed bottom-4 left-4 right-4 z-50 h-14 shadow-lg" size="lg">
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  <span className="flex-1 text-left">Items to Add</span>
                  {pendingItems.length > 0 && <Badge variant="secondary" className="ml-2">{pendingItems.length}</Badge>}
                  <span className="ml-2 font-bold">{formatPrice(pendingTotal)}</span>
                  <ChevronUp className="h-5 w-5 ml-2" />
                </Button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[85vh]">
                <DrawerHeader>
                  <DrawerTitle>Items to Add</DrawerTitle>
                </DrawerHeader>
                <div className="px-4 pb-6 overflow-auto">{pendingSummary}</div>
              </DrawerContent>
            </Drawer>
          )}
        </div>
      </Layout>
    );
  }

  // ── Tab detail view ──
  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            All Tabs
          </Button>
          <div className="flex items-center justify-between mt-2">
            <div>
              <h2 className="text-2xl font-bold">{tab.customer_name || "Unnamed Tab"}</h2>
              <p className="text-muted-foreground text-sm flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Opened {new Date(tab.created_at).toLocaleString()}
              </p>
            </div>
            <Badge className="text-lg px-3 py-1">{formatPrice(runningTotal)}</Badge>
          </div>
        </div>

        {/* Tab items */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Items on Tab</CardTitle>
          </CardHeader>
          <CardContent>
            {tabItems.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No items yet — add some!</p>
            ) : (
              <div className="space-y-3">
                {tabItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeSavedItem(item)}>
                      <X className="h-4 w-4" />
                    </Button>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.menu_item_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity}× {formatPrice(item.base_price_at_time)}
                        {item.extra_units > 0 && ` + ${item.extra_units} extra`}
                      </p>
                    </div>
                    <p className="font-medium text-sm">{formatPrice(item.subtotal)}</p>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span className="text-primary">{formatPrice(runningTotal)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button className="flex-1" onClick={() => setShowAddItems(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Items
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            disabled={tabItems.length === 0}
            onClick={() => setCloseDialogOpen(true)}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Close Tab
          </Button>
        </div>

        {/* Close tab dialog */}
        <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Close Tab — {tab.customer_name || "Unnamed"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span className="text-primary">{formatPrice(runningTotal)}</span>
              </div>
              <div>
                <Label>Payment Method</Label>
                <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="mt-2 grid grid-cols-2 gap-2">
                  {paymentMethods.map((method) => (
                    <div key={method} className="flex items-center space-x-2">
                      <RadioGroupItem value={method} id={`close-${method.toLowerCase()}`} />
                      <Label htmlFor={`close-${method.toLowerCase()}`} className="font-normal">{method}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCloseTab} disabled={closing}>
                {closing ? "Closing…" : "Close & Create Order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

// ── Main Page ────────────────────────────────────────────────
const TabsPage = () => {
  const { restaurantId, loading: restaurantLoading } = useRestaurantContext();
  const { data: tabsData = [], isLoading: tabsLoading } = useTabs();
  const tabs = tabsData as Tab[];
  const invalidateTabs = useInvalidateTabs();
  const loading = restaurantLoading || tabsLoading;
  const [selectedTab, setSelectedTab] = useState<Tab | null>(null);
  const [newTabDialogOpen, setNewTabDialogOpen] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [newTabNotes, setNewTabNotes] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreateTab = async () => {
    if (!restaurantId) return;
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("tabs")
        .insert({
          restaurant_id: restaurantId,
          staff_id: user.id,
          customer_name: newTabName.trim() || null,
          notes: newTabNotes.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;

      toast.success("Tab opened");
      setNewTabDialogOpen(false);
      setNewTabName("");
      setNewTabNotes("");
      setSelectedTab(data);
      invalidateTabs();
    } catch (err: any) {
      toast.error(err.message || "Failed to open tab");
    } finally {
      setCreating(false);
    }
  };

  if (selectedTab) {
    return (
      <TabDetail
        tab={selectedTab}
        restaurantId={restaurantId!}
        onBack={() => {
          setSelectedTab(null);
          invalidateTabs();
        }}
        onClosed={() => {
          setSelectedTab(null);
          invalidateTabs();
        }}
      />
    );
  }

  return (
    <Layout>
      <TabsList tabs={tabs} loading={loading} onOpenTab={setSelectedTab} onNewTab={() => setNewTabDialogOpen(true)} />

      <Dialog open={newTabDialogOpen} onOpenChange={setNewTabDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open New Tab</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="tab-name">Customer / Table Name</Label>
              <Input
                id="tab-name"
                value={newTabName}
                onChange={(e) => setNewTabName(e.target.value.slice(0, 100))}
                placeholder='e.g. "Table 3" or "John"'
                className="mt-2"
                maxLength={100}
              />
            </div>
            <div>
              <Label htmlFor="tab-notes">Notes (optional)</Label>
              <Textarea
                id="tab-notes"
                value={newTabNotes}
                onChange={(e) => setNewTabNotes(e.target.value.slice(0, 1000))}
                placeholder="Any notes…"
                className="mt-2"
                rows={2}
                maxLength={1000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTabDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTab} disabled={creating}>
              {creating ? "Opening…" : "Open Tab"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default TabsPage;
