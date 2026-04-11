import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Receipt, Calendar, TrendingUp, Edit, Trash2, Archive, Printer, Clock, DollarSign, CheckCircle, XCircle, Globe } from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatDateFull } from "@/lib/date-format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPrice } from "@/lib/currency";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import ExpenseManager from "@/components/expenses/ExpenseManager";
import { useOrders, useInvalidateOrders, useMenuTags, useMenuItems } from "@/hooks/useQueries";
import { stopAlarm } from "@/components/NotificationSound";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";

interface DailyReportInfo {
  id: string;
  report_date: string;
  total_orders: number;
  total_revenue: number;
  created_at: string;
}
interface Order {
  id: string;
  order_number: string;
  total: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
  is_public_order?: boolean;
  customer_name?: string | null;
  status?: string;
}
interface OrderItem {
  id: string;
  menu_item_name: string;
  quantity: number;
  price_at_time: number;
  subtotal: number;
}
interface OrderWithItems extends Order {
  items: OrderItem[];
}
interface DailyReport {
  total_orders: number;
  total_revenue: number;
  payment_methods: Record<string, {
    count: number;
    total: number;
  }>;
  orders: OrderWithItems[];
}
const OrderHistory = () => {
  const navigate = useNavigate();
  const { restaurantId } = useRestaurantContext();
  const { data: ordersData, isLoading: loading } = useOrders();
  const invalidateOrders = useInvalidateOrders();

  // Real-time: refresh orders on any insert/update/delete
  useEffect(() => {
    if (!restaurantId) return;

    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          invalidateOrders();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [restaurantId, invalidateOrders]);

  const recentOrdersRaw = (ordersData?.recentOrders || []) as Order[];
  // Sort pending orders to the top
  const recentOrders = useMemo(() => {
    return [...recentOrdersRaw].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return 0;
    });
  }, [recentOrdersRaw]);
  const archivedOrders = (ordersData?.archivedOrders || []) as Order[];
  const dailyReports = (ordersData?.dailyReports || []) as DailyReportInfo[];
  const lastEndDayDate = ordersData?.lastEndDayDate ?? null;

  const [showReport, setShowReport] = useState(false);
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"none" | "month" | "year">("none");
  const { data: menuTags = [] } = useMenuTags();
  const { data: allMenuItems = [] } = useMenuItems();
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [orderItemsMap, setOrderItemsMap] = useState<Record<string, string[]>>({});

  // Build set of categories for the selected tag
  const taggedCategories = useMemo(() => {
    if (selectedTag === "all") return null;
    const cats = new Set<string>();
    (menuTags as any[]).forEach(tag => {
      if (tag.name === selectedTag && tag.category) cats.add(tag.category);
    });
    return cats;
  }, [selectedTag, menuTags]);

  // Build menu item id → category lookup
  const menuItemCategoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    (allMenuItems as any[]).forEach(item => {
      if (item.category) map[item.id] = item.category;
    });
    return map;
  }, [allMenuItems]);

  // Fetch order items when tag is selected
  useMemo(() => {
    if (selectedTag !== "all") {
      const allOrderIds = [...recentOrdersRaw, ...archivedOrders].map(o => o.id);
      if (allOrderIds.length > 0) {
        supabase
          .from("order_items")
          .select("order_id, menu_item_id")
          .in("order_id", allOrderIds)
          .then(({ data }) => {
            if (data) {
              const map: Record<string, string[]> = {};
              data.forEach(item => {
                if (!map[item.order_id]) map[item.order_id] = [];
                map[item.order_id].push(item.menu_item_id);
              });
              setOrderItemsMap(map);
            }
          });
      }
    }
  }, [selectedTag, recentOrdersRaw, archivedOrders]);

  // Filter orders by selected tag (via category)
  const filterOrdersByTag = (orders: Order[]) => {
    if (selectedTag === "all" || !taggedCategories || taggedCategories.size === 0) return orders;
    return orders.filter(order => {
      const itemIds = orderItemsMap[order.id] || [];
      return itemIds.some(id => {
        const cat = menuItemCategoryMap[id];
        return cat && taggedCategories.has(cat);
      });
    });
  };

  const filteredRecentOrders = useMemo(() => filterOrdersByTag(recentOrders), [recentOrders, selectedTag, orderItemsMap, menuItemCategoryMap, taggedCategories]);
  const filteredArchivedOrders = useMemo(() => filterOrdersByTag(archivedOrders), [archivedOrders, selectedTag, orderItemsMap, menuItemCategoryMap, taggedCategories]);

  // Group daily reports by month or year
  const groupedReports = useMemo(() => {
    if (groupBy === "none") return null;
    
    const groups: Record<string, { label: string; reports: DailyReportInfo[]; totalRevenue: number; totalOrders: number }> = {};
    
    dailyReports.forEach(report => {
      const date = parseISO(report.report_date);
      const key = groupBy === "month" 
        ? format(date, "yyyy-MM")
        : format(date, "yyyy");
      const label = groupBy === "month"
        ? format(date, "MMMM yyyy")
        : format(date, "yyyy");
      
      if (!groups[key]) {
        groups[key] = { label, reports: [], totalRevenue: 0, totalOrders: 0 };
      }
      groups[key].reports.push(report);
      groups[key].totalRevenue += report.total_revenue;
      groups[key].totalOrders += report.total_orders;
    });
    
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [dailyReports, groupBy]);

  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;
    try {
      const { error: itemsError } = await supabase.from("order_items").delete().eq("order_id", orderToDelete);
      if (itemsError) throw itemsError;
      const { error: orderError } = await supabase.from("orders").delete().eq("id", orderToDelete);
      if (orderError) throw orderError;
      toast.success("Order deleted successfully");
      invalidateOrders();
    } catch (error: any) {
      toast.error("Failed to delete order");
    } finally {
      setDeleteDialogOpen(false);
      setOrderToDelete(null);
    }
  };
  const confirmDelete = (orderId: string) => {
    setOrderToDelete(orderId);
    setDeleteDialogOpen(true);
  };
  const handleEndDay = async () => {
    setGeneratingReport(true);
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (!restaurantId) {
        toast.error("No restaurant found");
        setGeneratingReport(false);
        return;
      }

      // Get the most recent daily report to find last end day using created_at timestamp
      const {
        data: lastReport
      } = await supabase.from("daily_reports")
        .select("created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      // Use the exact timestamp of the last report as cutoff
      const cutoffDate = lastReport ? new Date(lastReport.created_at) : new Date(0);
      const today = format(new Date(), "yyyy-MM-dd");

      // Fetch all orders since last end day for this restaurant
      const {
        data: ordersData,
        error: ordersError
      } = await supabase.from("orders").select("*").eq("restaurant_id", restaurantId).eq("status", "confirmed").gte("created_at", cutoffDate.toISOString()).order("created_at", {
        ascending: false
      });
      if (ordersError) throw ordersError;
      if (!ordersData || ordersData.length === 0) {
        toast.error("No orders found since last end day");
        setGeneratingReport(false);
        return;
      }

      // Fetch all order items for these orders
      const orderIds = ordersData.map(o => o.id);
      const {
        data: itemsData,
        error: itemsError
      } = await supabase.from("order_items").select("*").in("order_id", orderIds);
      if (itemsError) throw itemsError;

      // Combine orders with their items
      const ordersWithItems: OrderWithItems[] = ordersData.map(order => ({
        ...order,
        items: itemsData?.filter(item => item.order_id === order.id) || []
      }));

      // Calculate totals
      const totalRevenue = ordersData.reduce((sum, order) => sum + Number(order.total), 0);
      const paymentMethods: Record<string, {
        count: number;
        total: number;
      }> = {};
      ordersData.forEach(order => {
        if (!paymentMethods[order.payment_method]) {
          paymentMethods[order.payment_method] = {
            count: 0,
            total: 0
          };
        }
        paymentMethods[order.payment_method].count++;
        paymentMethods[order.payment_method].total += Number(order.total);
      });

      // Save daily report - use insert (not upsert) to allow multiple reports per day
      const {
        error: reportError
      } = await supabase.from("daily_reports").insert({
        staff_id: user.id,
        restaurant_id: restaurantId,
        report_date: today,
        total_orders: ordersData.length,
        total_revenue: totalRevenue,
        payment_methods: paymentMethods
      });
      if (reportError) throw reportError;

      // Set report data and show dialog
      setDailyReport({
        total_orders: ordersData.length,
        total_revenue: totalRevenue,
        payment_methods: paymentMethods,
        orders: ordersWithItems
      });
      setShowReport(true);
      toast.success("Daily report generated successfully");
      invalidateOrders(); // Refresh orders to update the cutoff
    } catch (error: any) {
      toast.error(error.message || "Failed to generate report");
    } finally {
      setGeneratingReport(false);
    }
  };





  const handleConfirmOrder = async (orderId: string) => {
    try {
      const { error } = await supabase.from("orders").update({ status: 'confirmed' }).eq("id", orderId);
      if (error) throw error;
      toast.dismiss(`pending-order-${orderId}`);
      toast.success("Order confirmed!");
      invalidateOrders();
      // Check if any pending orders remain
      const remaining = recentOrders.filter(o => o.status === 'pending' && o.id !== orderId);
      if (remaining.length === 0) stopAlarm();
    } catch (error: any) {
      toast.error("Failed to confirm order");
    }
  };

  const handleDeclineOrder = async (orderId: string) => {
    try {
      // Delete order items first, then the order
      const { error: itemsError } = await supabase.from("order_items").delete().eq("order_id", orderId);
      if (itemsError) throw itemsError;
      const { error } = await supabase.from("orders").delete().eq("id", orderId);
      if (error) throw error;
      toast.dismiss(`pending-order-${orderId}`);
      toast.success("Order declined and removed");
      invalidateOrders();
      // Check if any pending orders remain
      const remaining = recentOrders.filter(o => o.status === 'pending' && o.id !== orderId);
      if (remaining.length === 0) stopAlarm();
    } catch (error: any) {
      toast.error("Failed to decline order");
    }
  };

  const renderOrderCard = (order: Order) => {
    const isPending = order.status === 'pending';
    const isOnline = order.is_public_order;

    return (
      <Card key={order.id} className={`hover:shadow-md transition-shadow ${isPending ? 'border-yellow-500/50 bg-yellow-500/5' : ''}`}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1">
              <CardTitle className="text-xl flex items-center gap-2 flex-wrap">
                Order #{order.order_number}
                <Badge variant="outline" className="font-normal">
                  {order.payment_method}
                </Badge>
                {isOnline && (
                  <Badge variant="secondary" className="font-normal gap-1">
                    <Globe className="h-3 w-3" />
                    Online
                  </Badge>
                )}
                {isPending && (
                  <Badge className="bg-yellow-500 text-yellow-950 font-medium">Pending</Badge>
                )}
              </CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                {format(new Date(order.created_at), "PPp")}
              </CardDescription>
              {order.customer_name && (
                <CardDescription className="text-sm">
                  Customer: {order.customer_name}
                </CardDescription>
              )}
              {order.notes && <CardDescription className="text-sm mt-2">
                  Note: {order.notes}
                </CardDescription>}
            </div>
            <div className="text-right space-y-2">
              <p className="text-2xl font-bold text-primary">
                {formatPrice(order.total)}
              </p>
              {isPending ? (
                <div className="flex gap-2">
                  <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700" onClick={() => handleConfirmOrder(order.id)}>
                    <CheckCircle className="h-4 w-4" />
                    Confirm
                  </Button>
                  <Button size="sm" variant="destructive" className="gap-1" onClick={() => handleDeclineOrder(order.id)}>
                    <XCircle className="h-4 w-4" />
                    Decline
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/receipt/${order.id}`)}>
                    <Receipt className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/receipt/${order.id}?edit=true`)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => confirmDelete(order.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  };
  return <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Order History</h2>
            <p className="text-muted-foreground">Manage and track all orders</p>
          </div>
          <Button onClick={handleEndDay} disabled={generatingReport} size="lg" className="gap-2 bg-destructive hover:bg-destructive/90">
            <TrendingUp className="h-4 w-4" />
            {generatingReport ? "Generating..." : "End Day"}
          </Button>
        </div>

        {/* Today's Revenue Card */}
        {!loading && (
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Current Period Revenue</CardTitle>
                </div>
                <p className="text-3xl font-bold text-primary">
                  {formatPrice(recentOrders.filter(o => o.status === 'confirmed').reduce((sum, order) => sum + Number(order.total), 0))}
                </p>
              </div>
              <CardDescription>
                {recentOrders.filter(o => o.status === 'confirmed').length} confirmed order{recentOrders.filter(o => o.status === 'confirmed').length !== 1 ? 's' : ''} since {lastEndDayDate ? format(new Date(lastEndDayDate), "PP p") : "start"}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <ExpenseManager />

        {loading && <p className="text-center text-muted-foreground">Loading orders...</p>}

        {!loading && recentOrders.length === 0 && archivedOrders.length === 0 && <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">No orders yet</p>
              <Button onClick={() => navigate("/order/create")}>Create First Order</Button>
            </CardContent>
          </Card>}

        {!loading && (recentOrders.length > 0 || archivedOrders.length > 0 || dailyReports.length > 0) && <Tabs defaultValue="recent" className="space-y-4">
            {/* Tag Filter */}
            {menuTags.length > 0 && (() => {
              const uniqueNames = [...new Set((menuTags as any[]).map(t => t.name))].sort();
              return (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Filter by tag:</span>
                  <Badge
                    variant={selectedTag === "all" ? "default" : "outline"}
                    className="cursor-pointer select-none"
                    onClick={() => setSelectedTag("all")}
                  >
                    All
                  </Badge>
                  {uniqueNames.map((name: string) => (
                    <Badge
                      key={name}
                      variant={selectedTag === name ? "default" : "outline"}
                      className="cursor-pointer select-none"
                      onClick={() => setSelectedTag(name)}
                    >
                      {name}
                    </Badge>
                  ))}
                </div>
              );
            })()}

            <TabsList>
              <TabsTrigger value="recent" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {lastEndDayDate ? `Since ${format(new Date(lastEndDayDate), "PP p")}` : "All Orders"}
                <Badge variant="secondary" className="ml-1">
                  {filteredRecentOrders.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="archived" className="flex items-center gap-2">
                <Archive className="h-4 w-4" />
                Archives
                <Badge variant="secondary" className="ml-1">
                  {filteredArchivedOrders.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="recent" className="space-y-4">
              {filteredRecentOrders.length === 0 ? <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">{selectedTag !== "all" ? "No orders match this tag" : "No recent orders"}</p>
                  </CardContent>
                </Card> : <div className="space-y-4">
                  {filteredRecentOrders.map(renderOrderCard)}
                </div>}
            </TabsContent>

            <TabsContent value="archived" className="space-y-4">
              {archivedOrders.length === 0 && dailyReports.length === 0 ? <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">No archived orders</p>
                  </CardContent>
                </Card> : <div className="space-y-6">
                  {/* Group by selector */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">Group by:</span>
                    <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "none" | "month" | "year")}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="month">Month</SelectItem>
                        <SelectItem value="year">Year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {groupBy !== "none" && groupedReports ? (
                    /* Grouped view */
                    groupedReports.map(([key, group]) => (
                      <Card key={key}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">{group.label}</CardTitle>
                            <div className="text-right">
                              <p className="text-lg font-bold text-primary">{formatPrice(group.totalRevenue)}</p>
                              <p className="text-xs text-muted-foreground">{group.totalOrders} orders • {group.reports.length} reports</p>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {group.reports.map(report => (
                            <div key={report.id} className="flex items-center gap-3 bg-muted/50 p-3 rounded-lg">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <div className="flex-1">
                                <p className="font-medium text-sm">
                                  {format(new Date(report.created_at), "PPP 'at' p")}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {report.total_orders} orders • {formatPrice(report.total_revenue)}
                                </p>
                              </div>
                              <Button size="sm" variant="outline" onClick={() => navigate(`/report/${report.id}`)}>
                                View
                              </Button>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    /* Ungrouped view (original) */
                    dailyReports.map((report, index) => {
                      const reportTimestamp = new Date(report.created_at);
                      const prevReport = dailyReports[index + 1];
                      const prevCutoff = prevReport ? new Date(prevReport.created_at) : new Date(0);
                      const periodOrders = archivedOrders.filter(order => {
                        const orderDate = new Date(order.created_at);
                        return orderDate < reportTimestamp && orderDate >= prevCutoff;
                      });
                      return (
                        <div key={report.id} className="space-y-3">
                          <div className="flex items-center gap-3 bg-muted/50 p-3 rounded-lg">
                            <Clock className="h-5 w-5 text-muted-foreground" />
                            <div className="flex-1">
                              <p className="font-semibold">
                                Day ended: {format(new Date(report.created_at), "PPP 'at' p")}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {report.total_orders} orders • {formatPrice(report.total_revenue)} total
                              </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => navigate(`/report/${report.id}`)}>
                              View Breakdown
                            </Button>
                          </div>
                          {periodOrders.length > 0 && (
                            <div className="space-y-4 pl-4 border-l-2 border-muted">
                              {periodOrders.map(renderOrderCard)}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>}
            </TabsContent>
          </Tabs>}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this order? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOrder}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto print:max-h-none print:overflow-visible print:max-w-none print:w-full print:h-auto print:border-none print:shadow-none print:p-0" id="eod-print">
          <DialogHeader className="print:hidden">
            <DialogTitle className="text-2xl">Daily Report</DialogTitle>
            <DialogDescription>
              Summary for {format(new Date(), "PPP")}
            </DialogDescription>
          </DialogHeader>

          {dailyReport && <div className="space-y-6">
              <div className="print:text-center print:mb-6">
                <h1 className="text-2xl font-bold hidden print:block">Daily Report</h1>
                <p className="text-muted-foreground hidden print:block">
                  {format(new Date(), "PPP")}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 print:mb-6">
                <Card className="print:shadow-none print:border-2">
                  <CardHeader className="pb-3">
                    <CardDescription>Total Orders</CardDescription>
                    <CardTitle className="text-3xl text-primary">
                      {dailyReport.total_orders}
                    </CardTitle>
                  </CardHeader>
                </Card>

                <Card className="print:shadow-none print:border-2">
                  <CardHeader className="pb-3">
                    <CardDescription>Total Revenue</CardDescription>
                    <CardTitle className="text-3xl text-primary">
                      {formatPrice(dailyReport.total_revenue)}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              <Separator />

              <div className="print:mb-6">
                <h3 className="font-semibold mb-4">Payment Methods Breakdown</h3>
                <div className="space-y-3">
                  {Object.entries(dailyReport.payment_methods).map(([method, data]) => <div key={method} className="flex items-center justify-between p-3 bg-muted rounded-lg print:border print:border-border">
                      <div>
                        <p className="font-medium">{method}</p>
                        <p className="text-sm text-muted-foreground">
                          {data.count} {data.count === 1 ? "order" : "orders"}
                        </p>
                      </div>
                      <p className="text-lg font-bold text-primary">
                        {formatPrice(data.total)}
                      </p>
                    </div>)}
                </div>
              </div>

              <Separator />

              {/* Category Breakdown */}
              <div className="print:mb-6">
                <h3 className="font-semibold mb-4">Items by Category</h3>
                <div className="space-y-3">
                  {(() => {
                    const categoryMap: Record<string, { name: string; totalQty: number; totalRevenue: number }[]> = {};
                    dailyReport.orders.forEach(order => {
                      order.items.forEach(item => {
                        // We don't have category on order_items, so group by item name
                        const key = item.menu_item_name;
                        if (!categoryMap["Items"]) categoryMap["Items"] = [];
                        const existing = categoryMap["Items"].find(c => c.name === key);
                        if (existing) {
                          existing.totalQty += item.quantity;
                          existing.totalRevenue += item.subtotal;
                        } else {
                          categoryMap["Items"].push({ name: key, totalQty: item.quantity, totalRevenue: item.subtotal });
                        }
                      });
                    });
                    const allItems = categoryMap["Items"] || [];
                    allItems.sort((a, b) => b.totalRevenue - a.totalRevenue);
                    return allItems.map(item => (
                      <div key={item.name} className="flex items-center justify-between p-3 bg-muted rounded-lg print:border print:border-border">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.totalQty} sold
                          </p>
                        </div>
                        <p className="text-lg font-bold text-primary">
                          {formatPrice(item.totalRevenue)}
                        </p>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              <Separator />

              <div className="print:break-before-page">
                <h3 className="font-semibold mb-4 text-lg">All Receipts</h3>
                <div className="space-y-6">
                  {dailyReport.orders.map((order, index) => <div key={order.id} className="print:break-inside-avoid">
                      <Card className="print:shadow-none print:border-2 print:mb-4">
                        <CardHeader className="space-y-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">Order #{order.order_number}</CardTitle>
                            <Badge variant="outline">{order.payment_method}</Badge>
                          </div>
                          <CardDescription>
                            {format(new Date(order.created_at), "PPp")}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="space-y-2">
                          {order.items.map(item => <div key={item.id} className="flex justify-between text-sm">
                                <div className="flex-1">
                                  <p className="font-medium">{item.menu_item_name}</p>
                                  <p className="text-muted-foreground">
                                    {item.quantity} × {formatPrice(item.price_at_time)}
                                  </p>
                                </div>
                                <p className="font-medium">{formatPrice(item.subtotal)}</p>
                              </div>)}
                          </div>
                          <Separator />
                          <div className="flex justify-between font-bold">
                            <span>Total</span>
                            <span className="text-primary">{formatPrice(order.total)}</span>
                          </div>
                          {order.notes && <div className="text-sm">
                              <p className="text-muted-foreground">Notes:</p>
                              <p>{order.notes}</p>
                            </div>}
                        </CardContent>
                      </Card>
                      {index < dailyReport.orders.length - 1 && <Separator className="my-4 print:hidden" />}
                    </div>)}
                </div>
              </div>

              <div className="flex gap-2 print:hidden">
                <Button className="flex-1" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print Report
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setShowReport(false)}>
                  Close
                </Button>
              </div>
            </div>}
        </DialogContent>
      </Dialog>


    </Layout>;
};
export default OrderHistory;