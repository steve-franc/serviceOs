import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Receipt, Calendar, TrendingUp, Edit, Trash2, Archive, Printer, Clock, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { formatPrice } from "@/lib/currency";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import ExpenseManager from "@/components/expenses/ExpenseManager";

interface DailyReportInfo {
  id: string;
  report_date: string;
  total_orders: number;
  total_revenue: number;
  created_at: string;
}
interface Order {
  id: string;
  order_number: number;
  total: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
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
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [archivedOrders, setArchivedOrders] = useState<Order[]>([]);
  const [dailyReports, setDailyReports] = useState<DailyReportInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [lastEndDayDate, setLastEndDayDate] = useState<string | null>(null);
  
  useEffect(() => {
    fetchOrders();
  }, []);
  
  const fetchOrders = async () => {
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get the user's restaurant
      const { data: membership } = await supabase
        .from("restaurant_memberships")
        .select("restaurant_id")
        .eq("user_id", user.id)
        .maybeSingle();

      const userRestaurantId = membership?.restaurant_id;

      // Get all daily reports to find periods - filter by restaurant, not staff
      const {
        data: reportsData
      } = await supabase.from("daily_reports")
        .select("id, report_date, total_orders, total_revenue, created_at")
        .eq("restaurant_id", userRestaurantId)
        .order("created_at", { ascending: false });
      
      setDailyReports(reportsData || []);
      
      const lastReport = reportsData?.[0];
      
      let cutoffDate: Date;
      if (lastReport) {
        // Use the exact timestamp of the last report as cutoff
        cutoffDate = new Date(lastReport.created_at);
        setLastEndDayDate(lastReport.created_at);
      } else {
        // If no reports exist, show all orders as recent
        cutoffDate = new Date(0); // Beginning of time
        setLastEndDayDate(null);
      }
      const {
        data: allOrders,
        error
      } = await supabase.from("orders").select("*").order("created_at", {
        ascending: false
      });
      if (error) throw error;
      const recent: Order[] = [];
      const archived: Order[] = [];
      allOrders?.forEach(order => {
        const orderDate = new Date(order.created_at);
        if (orderDate >= cutoffDate) {
          recent.push(order);
        } else {
          archived.push(order);
        }
      });
      setRecentOrders(recent);
      setArchivedOrders(archived);
    } catch (error: any) {
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  };
  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;
    try {
      // First delete order items
      const {
        error: itemsError
      } = await supabase.from("order_items").delete().eq("order_id", orderToDelete);
      if (itemsError) throw itemsError;

      // Then delete the order
      const {
        error: orderError
      } = await supabase.from("orders").delete().eq("id", orderToDelete);
      if (orderError) throw orderError;
      toast.success("Order deleted successfully");
      fetchOrders();
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

      // Get the user's restaurant
      const { data: membership } = await supabase
        .from("restaurant_memberships")
        .select("restaurant_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!membership?.restaurant_id) {
        toast.error("No restaurant found");
        setGeneratingReport(false);
        return;
      }

      const restaurantId = membership.restaurant_id;

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
      } = await supabase.from("orders").select("*").eq("restaurant_id", restaurantId).gte("created_at", cutoffDate.toISOString()).order("created_at", {
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
      fetchOrders(); // Refresh orders to update the cutoff
    } catch (error: any) {
      toast.error(error.message || "Failed to generate report");
    } finally {
      setGeneratingReport(false);
    }
  };


  const renderReportBreakdown = (reportData: DailyReport, reportDate: string) => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Orders</CardDescription>
            <CardTitle className="text-3xl text-primary">{reportData.total_orders}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Revenue</CardDescription>
            <CardTitle className="text-3xl text-primary">{formatPrice(reportData.total_revenue)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {Object.keys(reportData.payment_methods).length > 0 && <>
        <Separator />
        <div>
          <h3 className="font-semibold mb-4">Payment Methods Breakdown</h3>
          <div className="space-y-3">
            {Object.entries(reportData.payment_methods).map(([method, data]) => (
              <div key={method} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <p className="font-medium">{method}</p>
                  <p className="text-sm text-muted-foreground">{data.count} {data.count === 1 ? "order" : "orders"}</p>
                </div>
                <p className="text-lg font-bold text-primary">{formatPrice(data.total)}</p>
              </div>
            ))}
          </div>
        </div>
      </>}

      {reportData.orders.length > 0 && <>
        <Separator />
        <div>
          <h3 className="font-semibold mb-4">Items by Category</h3>
          <div className="space-y-3">
            {(() => {
              const itemMap: Record<string, { totalQty: number; totalRevenue: number }> = {};
              reportData.orders.forEach(order => {
                order.items.forEach(item => {
                  if (!itemMap[item.menu_item_name]) itemMap[item.menu_item_name] = { totalQty: 0, totalRevenue: 0 };
                  itemMap[item.menu_item_name].totalQty += item.quantity;
                  itemMap[item.menu_item_name].totalRevenue += item.subtotal;
                });
              });
              return Object.entries(itemMap)
                .sort(([, a], [, b]) => b.totalRevenue - a.totalRevenue)
                .map(([name, data]) => (
                  <div key={name} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">{name}</p>
                      <p className="text-sm text-muted-foreground">{data.totalQty} sold</p>
                    </div>
                    <p className="text-lg font-bold text-primary">{formatPrice(data.totalRevenue)}</p>
                  </div>
                ));
            })()}
          </div>
        </div>

        <Separator />
        <div>
          <h3 className="font-semibold mb-4 text-lg">All Receipts</h3>
          <div className="space-y-4">
            {reportData.orders.map(order => (
              <Card key={order.id}>
                <CardHeader className="space-y-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Order #{order.order_number}</CardTitle>
                    <Badge variant="outline">{order.payment_method}</Badge>
                  </div>
                  <CardDescription>{format(new Date(order.created_at), "PPp")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {order.items.map(item => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <div className="flex-1">
                          <p className="font-medium">{item.menu_item_name}</p>
                          <p className="text-muted-foreground">{item.quantity} × {formatPrice(item.price_at_time)}</p>
                        </div>
                        <p className="font-medium">{formatPrice(item.subtotal)}</p>
                      </div>
                    ))}
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span className="text-primary">{formatPrice(order.total)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </>}
    </div>
  );

  const renderOrderCard = (order: Order) => <Card key={order.id} className="hover:shadow-md transition-shadow">
      <CardHeader className="bg-[F5F5F0] bg-[#f5f5f0]">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-xl flex items-center gap-2">
              Order #{order.order_number}
              <Badge variant="outline" className="font-normal">
                {order.payment_method}
              </Badge>
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <Calendar className="h-3 w-3" />
              {format(new Date(order.created_at), "PPp")}
            </CardDescription>
            {order.notes && <CardDescription className="text-sm mt-2">
                Note: {order.notes}
              </CardDescription>}
          </div>
          <div className="text-right space-y-2">
            <p className="text-2xl font-bold text-primary">
              {formatPrice(order.total)}
            </p>
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
          </div>
        </div>
      </CardHeader>
    </Card>;
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
                  {formatPrice(recentOrders.reduce((sum, order) => sum + Number(order.total), 0))}
                </p>
              </div>
              <CardDescription>
                {recentOrders.length} order{recentOrders.length !== 1 ? 's' : ''} since {lastEndDayDate ? format(new Date(lastEndDayDate), "PP p") : "start"}
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

        {!loading && (recentOrders.length > 0 || archivedOrders.length > 0) && <Tabs defaultValue="recent" className="space-y-4">
            <TabsList>
              <TabsTrigger value="recent" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {lastEndDayDate ? `Since ${format(new Date(lastEndDayDate), "PP p")}` : "All Orders"}
                <Badge variant="secondary" className="ml-1">
                  {recentOrders.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="archived" className="flex items-center gap-2">
                <Archive className="h-4 w-4" />
                Archives
                <Badge variant="secondary" className="ml-1">
                  {archivedOrders.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="recent" className="space-y-4">
              {recentOrders.length === 0 ? <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">No recent orders</p>
                  </CardContent>
                </Card> : <div className="space-y-4">
                  {recentOrders.map(renderOrderCard)}
                </div>}
            </TabsContent>

            <TabsContent value="archived" className="space-y-4">
              {archivedOrders.length === 0 ? <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">No archived orders</p>
                  </CardContent>
                </Card> : <div className="space-y-6">
                  {dailyReports.map((report, index) => {
                    // Find orders that belong to this period (between this report's created_at and the previous one)
                    const reportTimestamp = new Date(report.created_at);
                    
                    const prevReport = dailyReports[index + 1];
                    const prevCutoff = prevReport 
                      ? new Date(prevReport.created_at)
                      : new Date(0);
                    
                    const periodOrders = archivedOrders.filter(order => {
                      const orderDate = new Date(order.created_at);
                      return orderDate < reportTimestamp && orderDate >= prevCutoff;
                    });
                    
                    if (periodOrders.length === 0) return null;
                    
                    return (
                      <div key={report.id} className="space-y-3">
                        <div className="flex items-center gap-3 bg-muted/50 p-3 rounded-lg cursor-pointer hover:bg-muted transition-colors" onClick={() => handleViewReport(report)}>
                          <Clock className="h-5 w-5 text-muted-foreground" />
                          <div className="flex-1">
                            <p className="font-semibold">
                              Day ended: {format(new Date(report.created_at), "PPP 'at' p")}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {report.total_orders} orders • {formatPrice(report.total_revenue)} total
                            </p>
                            <p className="text-xs text-primary mt-1">Tap to view breakdown →</p>
                          </div>
                          <Badge variant="secondary">{periodOrders.length} orders</Badge>
                        </div>
                        <div className="space-y-4 pl-4 border-l-2 border-muted">
                          {periodOrders.map(renderOrderCard)}
                        </div>
                      </div>
                    );
                  })}
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

      <Dialog open={!!viewingReport} onOpenChange={(open) => { if (!open) { setViewingReport(null); setViewingReportData(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Daily Report Breakdown</DialogTitle>
            <DialogDescription>
              {viewingReport && `Day ended: ${format(new Date(viewingReport.created_at), "PPP 'at' p")}`}
            </DialogDescription>
          </DialogHeader>
          {loadingReportData ? (
            <p className="text-center text-muted-foreground py-8">Loading report details...</p>
          ) : viewingReportData ? (
            <>
              {renderReportBreakdown(viewingReportData, viewingReport ? format(new Date(viewingReport.created_at), "PPP") : "")}
              <div className="flex gap-2 mt-4">
                <Button variant="outline" className="flex-1" onClick={() => { setViewingReport(null); setViewingReportData(null); }}>
                  Close
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </Layout>;
};
export default OrderHistory;