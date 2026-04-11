import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Printer, Tag } from "lucide-react";
import { format } from "date-fns";
import { formatPrice } from "@/lib/currency";
import { toast } from "sonner";

interface OrderItem {
  id: string;
  menu_item_name: string;
  quantity: number;
  price_at_time: number;
  subtotal: number;
}

interface OrderWithItems {
  id: string;
  order_number: string;
  total: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
  items: OrderItem[];
}

interface MenuTag {
  id: string;
  name: string;
  category: string;
}

const ReportBreakdown = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [reportDate, setReportDate] = useState("");
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState<Record<string, { count: number; total: number }>>({});
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [menuTags, setMenuTags] = useState<MenuTag[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [menuItemCategories, setMenuItemCategories] = useState<Record<string, string>>({});

  useEffect(() => {
    loadReport();
  }, [id]);

  const loadReport = async () => {
    if (!id) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get this report
      const { data: report, error: reportError } = await supabase
        .from("daily_reports")
        .select("*")
        .eq("id", id)
        .single();
      if (reportError || !report) throw new Error("Report not found");

      setReportDate(report.created_at);
      setTotalOrders(report.total_orders);
      setTotalRevenue(Number(report.total_revenue));

      // Get all reports for this restaurant to find the previous cutoff
      const { data: allReports } = await supabase
        .from("daily_reports")
        .select("id, created_at")
        .eq("restaurant_id", report.restaurant_id)
        .order("created_at", { ascending: false });

      const reportIndex = allReports?.findIndex(r => r.id === id) ?? -1;
      const prevReport = allReports?.[reportIndex + 1];
      const prevCutoff = prevReport ? new Date(prevReport.created_at) : new Date(0);
      const reportTimestamp = new Date(report.created_at);

      // Fetch orders for this period
      const { data: ordersData } = await supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", report.restaurant_id)
        .gte("created_at", prevCutoff.toISOString())
        .lt("created_at", reportTimestamp.toISOString())
        .order("created_at", { ascending: false });

      if (ordersData && ordersData.length > 0) {
        const orderIds = ordersData.map(o => o.id);
        const { data: itemsData } = await supabase
          .from("order_items")
          .select("*")
          .in("order_id", orderIds);

        const ordersWithItems: OrderWithItems[] = ordersData.map(order => ({
          ...order,
          items: itemsData?.filter(item => item.order_id === order.id) || []
        }));

        const pm: Record<string, { count: number; total: number }> = {};
        ordersData.forEach(order => {
          if (!pm[order.payment_method]) pm[order.payment_method] = { count: 0, total: 0 };
          pm[order.payment_method].count++;
          pm[order.payment_method].total += Number(order.total);
        });

        setPaymentMethods(pm);
        setOrders(ordersWithItems);
      }

      // Fetch menu tags and menu item categories for tag filtering
      if (report.restaurant_id) {
        const [tagsResult, menuResult] = await Promise.all([
          supabase.from("menu_tags").select("*").eq("restaurant_id", report.restaurant_id),
          supabase.from("menu_items").select("name, category").eq("restaurant_id", report.restaurant_id),
        ]);
        if (tagsResult.data) setMenuTags(tagsResult.data as MenuTag[]);
        if (menuResult.data) {
          const catMap: Record<string, string> = {};
          menuResult.data.forEach((item: any) => {
            if (item.category) catMap[item.name] = item.category;
          });
          setMenuItemCategories(catMap);
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  // Build tag-to-categories mapping
  const tagCategoryMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    menuTags.forEach(tag => {
      if (!map[tag.name]) map[tag.name] = new Set();
      map[tag.name].add(tag.category);
    });
    return map;
  }, [menuTags]);

  const uniqueTags = useMemo(() => Object.keys(tagCategoryMap).sort(), [tagCategoryMap]);

  if (loading) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto py-12 text-center">
          <p className="text-muted-foreground">Loading report...</p>
        </div>
      </Layout>
    );
  }


  // Filter items by selected tag
  const isItemInTag = (itemName: string) => {
    if (selectedTag === "all") return true;
    const tagCategories = tagCategoryMap[selectedTag];
    if (!tagCategories) return false;
    const itemCategory = menuItemCategories[itemName];
    return itemCategory ? tagCategories.has(itemCategory) : false;
  };

  // Build items breakdown
  const itemMap: Record<string, { totalQty: number; totalRevenue: number; category?: string }> = {};
  orders.forEach(order => {
    order.items.forEach(item => {
      if (!isItemInTag(item.menu_item_name)) return;
      if (!itemMap[item.menu_item_name]) itemMap[item.menu_item_name] = { totalQty: 0, totalRevenue: 0, category: menuItemCategories[item.menu_item_name] };
      itemMap[item.menu_item_name].totalQty += item.quantity;
      itemMap[item.menu_item_name].totalRevenue += item.subtotal;
    });
  });
  const sortedItems = Object.entries(itemMap).sort(([, a], [, b]) => b.totalRevenue - a.totalRevenue);

  // Group sorted items by category
  const itemsByCategory: Record<string, typeof sortedItems> = {};
  sortedItems.forEach(([name, data]) => {
    const cat = data.category || "Uncategorized";
    if (!itemsByCategory[cat]) itemsByCategory[cat] = [];
    itemsByCategory[cat].push([name, data]);
  });

  const filteredTotalRevenue = sortedItems.reduce((sum, [, d]) => sum + d.totalRevenue, 0);
  const filteredTotalQty = sortedItems.reduce((sum, [, d]) => sum + d.totalQty, 0);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6" id="report-print">
        <div className="flex items-center gap-4 print:hidden">
          <Button variant="ghost" size="icon" onClick={() => navigate("/orders")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h2 className="text-3xl font-bold">Daily Report</h2>
            <p className="text-muted-foreground">
              {reportDate && `Day ended: ${format(new Date(reportDate), "PPP 'at' p")}`}
            </p>
          </div>
          <Button onClick={() => window.print()} className="gap-2">
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>

        <div className="hidden print:block text-center mb-6">
          <h1 className="text-2xl font-bold">Daily Report</h1>
          <p className="text-muted-foreground">
            {reportDate && format(new Date(reportDate), "PPP 'at' p")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Orders</CardDescription>
              <CardTitle className="text-3xl text-primary">{totalOrders}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Revenue</CardDescription>
              <CardTitle className="text-3xl text-primary">{formatPrice(totalRevenue)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {Object.keys(paymentMethods).length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="font-semibold mb-4 text-lg">Payment Methods Breakdown</h3>
              <div className="space-y-3">
                {Object.entries(paymentMethods).map(([method, data]) => (
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
          </>
        )}

        {sortedItems.length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="font-semibold mb-4 text-lg">Items Sold</h3>
              <div className="space-y-3">
                {sortedItems.map(([name, data]) => (
                  <div key={name} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">{name}</p>
                      <p className="text-sm text-muted-foreground">{data.totalQty} sold</p>
                    </div>
                    <p className="text-lg font-bold text-primary">{formatPrice(data.totalRevenue)}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {orders.length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="font-semibold mb-4 text-lg">All Receipts</h3>
              <div className="space-y-4">
                {orders.map(order => (
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
                      {order.notes && (
                        <div className="text-sm">
                          <p className="text-muted-foreground">Notes:</p>
                          <p>{order.notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default ReportBreakdown;
