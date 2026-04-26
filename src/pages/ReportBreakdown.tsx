import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Printer, Tag, TrendingDown, TrendingUp } from "lucide-react";
import { SmartBackButton } from "@/components/SmartBackButton";
import { formatPrice } from "@/lib/currency";
import { formatDateFull, dailyShareOfMonthly } from "@/lib/date-format";
import { sumPaidRevenue, sumUnpaidRevenue, dailyBillsTarget } from "@/lib/revenue";
import { format } from "date-fns";
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
  payment_status?: string | null;
  status?: string | null;
  notes: string | null;
  created_at: string;
  customer_name: string | null;
  items: OrderItem[];
}

interface MenuTag {
  id: string;
  name: string;
  category: string;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string | null;
  source: string | null;
  created_at: string;
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
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [fixedMonthlyExpenses, setFixedMonthlyExpenses] = useState(0);

  useEffect(() => {
    loadReport();
  }, [id]);

  const loadReport = async () => {
    if (!id) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: report, error: reportError } = await supabase
        .from("daily_reports")
        .select("*")
        .eq("id", id)
        .single();
      if (reportError || !report) throw new Error("Report not found");

      setReportDate(report.created_at);
      setTotalOrders(report.total_orders);
      setTotalRevenue(Number(report.total_revenue));

      const { data: allReports } = await supabase
        .from("daily_reports")
        .select("id, created_at")
        .eq("restaurant_id", report.restaurant_id)
        .order("created_at", { ascending: false });

      const reportIndex = allReports?.findIndex(r => r.id === id) ?? -1;
      const prevReport = allReports?.[reportIndex + 1];
      const prevCutoff = prevReport ? new Date(prevReport.created_at) : new Date(0);
      const reportTimestamp = new Date(report.created_at);

      // Fetch orders, expenses, tags, menu items, settings in parallel
      const [ordersResult, expensesResult, tagsResult, menuResult, settingsResult] = await Promise.all([
        supabase.from("orders").select("*").eq("restaurant_id", report.restaurant_id)
          .gte("created_at", prevCutoff.toISOString()).lt("created_at", reportTimestamp.toISOString())
          .order("created_at", { ascending: false }),
        supabase.from("daily_expenses").select("*").eq("restaurant_id", report.restaurant_id)
          .gte("created_at", prevCutoff.toISOString()).lt("created_at", reportTimestamp.toISOString())
          .order("created_at", { ascending: false }),
        supabase.from("menu_tags").select("*").eq("restaurant_id", report.restaurant_id),
        supabase.from("menu_items").select("name, category").eq("restaurant_id", report.restaurant_id),
        supabase.from("restaurant_settings").select("fixed_monthly_expenses").eq("restaurant_id", report.restaurant_id).maybeSingle(),
      ]);

      if (expensesResult.data) setExpenses(expensesResult.data as Expense[]);
      if (settingsResult.data) setFixedMonthlyExpenses(Number((settingsResult.data as any).fixed_monthly_expenses) || 0);
      if (tagsResult.data) setMenuTags(tagsResult.data as MenuTag[]);
      if (menuResult.data) {
        const catMap: Record<string, string> = {};
        menuResult.data.forEach((item: any) => {
          if (item.category) catMap[item.name] = item.category;
        });
        setMenuItemCategories(catMap);
      }

      if (ordersResult.data && ordersResult.data.length > 0) {
        const orderIds = ordersResult.data.map(o => o.id);
        const { data: itemsData } = await supabase
          .from("order_items").select("*").in("order_id", orderIds);

        const ordersWithItems: OrderWithItems[] = ordersResult.data.map(order => ({
          ...order,
          items: itemsData?.filter(item => item.order_id === order.id) || []
        }));

        const pm: Record<string, { count: number; total: number }> = {};
        ordersResult.data.forEach(order => {
          if ((order.payment_status ?? "paid") !== "paid") return;
          if (!pm[order.payment_method]) pm[order.payment_method] = { count: 0, total: 0 };
          pm[order.payment_method].count++;
          pm[order.payment_method].total += Number(order.total);
        });

        // Recompute totals from PAID orders only — unpaid orders never count as revenue.
        const paidRevenue = sumPaidRevenue(ordersResult.data as any);
        setTotalRevenue(paidRevenue);
        setTotalOrders(
          ordersResult.data.filter(
            (o: any) => (o.payment_status ?? "paid") === "paid" && (o.status ?? "confirmed") === "confirmed"
          ).length
        );

        setPaymentMethods(pm);
        setOrders(ordersWithItems);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  const tagCategoryMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    menuTags.forEach(tag => {
      if (!map[tag.name]) map[tag.name] = new Set();
      map[tag.name].add(tag.category);
    });
    return map;
  }, [menuTags]);

  const uniqueTags = useMemo(() => Object.keys(tagCategoryMap).sort(), [tagCategoryMap]);

  // Expense calculations — daily share of monthly bills uses /30 (business rule).
  const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const dailyFixedDeduction = dailyBillsTarget(fixedMonthlyExpenses);
  const unpaidDeduction = sumUnpaidRevenue(orders as any);
  const totalDeductions = totalExpenses + dailyFixedDeduction + unpaidDeduction;
  const netProfit = totalRevenue - totalDeductions;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Group expenses by source
  const expensesBySource: Record<string, number> = {};
  expenses.forEach(exp => {
    const src = exp.source || "Unspecified";
    expensesBySource[src] = (expensesBySource[src] || 0) + Number(exp.amount);
  });

  // Tag revenue deductions: expenses sourced from a tag should be deducted from that tag's revenue
  const tagDeductions: Record<string, number> = {};
  expenses.forEach(exp => {
    if (exp.source && uniqueTags.includes(exp.source)) {
      tagDeductions[exp.source] = (tagDeductions[exp.source] || 0) + Number(exp.amount);
    }
  });

  // Customer analytics
  const customerStats = useMemo(() => {
    const map: Record<string, { count: number; total: number; items: Record<string, number> }> = {};
    orders.forEach(order => {
      const name = order.customer_name || "Walk-in";
      if (!map[name]) map[name] = { count: 0, total: 0, items: {} };
      map[name].count++;
      map[name].total += Number(order.total);
      order.items.forEach(item => {
        map[name].items[item.menu_item_name] = (map[name].items[item.menu_item_name] || 0) + item.quantity;
      });
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 10);
  }, [orders]);

  if (loading) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto py-12 text-center">
          <p className="text-muted-foreground">Loading report...</p>
        </div>
      </Layout>
    );
  }

  const isItemInTag = (itemName: string) => {
    if (selectedTag === "all") return true;
    const tagCategories = tagCategoryMap[selectedTag];
    if (!tagCategories) return false;
    const itemCategory = menuItemCategories[itemName];
    return itemCategory ? tagCategories.has(itemCategory) : false;
  };

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

  const itemsByCategory: Record<string, typeof sortedItems> = {};
  sortedItems.forEach(([name, data]) => {
    const cat = data.category || "Uncategorized";
    if (!itemsByCategory[cat]) itemsByCategory[cat] = [];
    itemsByCategory[cat].push([name, data]);
  });

  const filteredTotalRevenue = sortedItems.reduce((sum, [, d]) => sum + d.totalRevenue, 0);
  const filteredTotalQty = sortedItems.reduce((sum, [, d]) => sum + d.totalQty, 0);

  const filteredPaymentMethods: Record<string, { count: number; total: number }> = {};
  if (selectedTag !== "all") {
    orders.forEach(order => {
      const tagItemsTotal = order.items
        .filter(item => isItemInTag(item.menu_item_name))
        .reduce((sum, item) => sum + item.subtotal, 0);
      if (tagItemsTotal > 0) {
        if (!filteredPaymentMethods[order.payment_method]) filteredPaymentMethods[order.payment_method] = { count: 0, total: 0 };
        filteredPaymentMethods[order.payment_method].count++;
        filteredPaymentMethods[order.payment_method].total += tagItemsTotal;
      }
    });
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6" id="report-print">
        <div className="flex items-center gap-4 print:hidden">
          <SmartBackButton />
          <div className="flex-1">
            <h2 className="text-3xl font-bold">Daily Report</h2>
            <p className="text-muted-foreground">
              {reportDate && formatDateFull(reportDate)}
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
            {reportDate && formatDateFull(reportDate)}
          </p>
        </div>

        {/* Revenue & Profit Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Expenses</CardDescription>
              <CardTitle className="text-3xl text-destructive">{formatPrice(totalDeductions)}</CardTitle>
            </CardHeader>
          </Card>
          <Card className={netProfit >= 0 ? "border-green-500/30" : "border-destructive/30"}>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-1">
                {netProfit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                Net Profit
              </CardDescription>
              <CardTitle className={`text-3xl ${netProfit >= 0 ? "text-green-600" : "text-destructive"}`}>
                {formatPrice(netProfit)}
              </CardTitle>
              <CardDescription className="text-xs">
                {profitMargin.toFixed(1)}% margin
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Expense Breakdown */}
        {(expenses.length > 0 || dailyFixedDeduction > 0) && (
          <>
            <Separator />
            <div>
              <h3 className="font-semibold mb-4 text-lg">Expense Breakdown</h3>
              <div className="space-y-3">
                {Object.entries(expensesBySource).map(([source, total]) => (
                  <div key={source} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">{source}</p>
                      <p className="text-xs text-muted-foreground">
                        {expenses.filter(e => (e.source || "Unspecified") === source).length} item(s)
                      </p>
                    </div>
                    <p className="text-lg font-bold text-destructive">-{formatPrice(total)}</p>
                  </div>
                ))}
                {dailyFixedDeduction > 0 && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">Fixed Monthly Costs (÷30)</p>
                      <p className="text-xs text-muted-foreground">
                        {formatPrice(fixedMonthlyExpenses)} / month
                      </p>
                    </div>
                    <p className="text-lg font-bold text-destructive">-{formatPrice(dailyFixedDeduction)}</p>
                  </div>
                )}
                <div className="flex items-center justify-between p-3 bg-destructive/10 rounded-lg font-bold">
                  <p>Total Outgoing</p>
                  <p className="text-destructive">-{formatPrice(totalDeductions)}</p>
                </div>
              </div>
            </div>

            {/* Individual expenses */}
            {expenses.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Expense Details</p>
                <div className="space-y-1">
                  {expenses.map(exp => (
                    <div key={exp.id} className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm">
                      <div className="flex-1">
                        <span className="font-medium">{exp.description}</span>
                        {exp.source && <span className="text-muted-foreground ml-2">({exp.source})</span>}
                      </div>
                      <span className="text-destructive font-medium">-{formatPrice(exp.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Revenue to Receive (after deductions) */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expected to Receive</p>
                <p className="text-xs text-muted-foreground">Revenue minus all expenses</p>
              </div>
              <p className="text-3xl font-bold text-primary">{formatPrice(netProfit)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Tag Revenue with Deductions */}
        {Object.keys(tagDeductions).length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="font-semibold mb-4 text-lg">Tag Revenue After Expenses</h3>
              <div className="space-y-3">
                {uniqueTags.map(tagName => {
                  // Calculate tag revenue
                  let tagRevenue = 0;
                  orders.forEach(order => {
                    order.items.forEach(item => {
                      const itemCat = menuItemCategories[item.menu_item_name];
                      if (itemCat && tagCategoryMap[tagName]?.has(itemCat)) {
                        tagRevenue += item.subtotal;
                      }
                    });
                  });
                  const deduction = tagDeductions[tagName] || 0;
                  if (tagRevenue === 0 && deduction === 0) return null;
                  return (
                    <div key={tagName} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium">{tagName}</p>
                        <Badge variant={tagRevenue - deduction >= 0 ? "default" : "destructive"}>
                          Net: {formatPrice(tagRevenue - deduction)}
                        </Badge>
                      </div>
                      <div className="flex gap-4 text-sm text-muted-foreground">
                        <span>Revenue: {formatPrice(tagRevenue)}</span>
                        {deduction > 0 && <span className="text-destructive">Expenses: -{formatPrice(deduction)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

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
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="font-semibold text-lg">Items Sold</h3>
                {uniqueTags.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <Select value={selectedTag} onValueChange={setSelectedTag}>
                      <SelectTrigger className="w-[160px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Items</SelectItem>
                        {uniqueTags.map(tag => (
                          <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              {selectedTag !== "all" && (
                <div className="space-y-3 mb-3">
                  <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Tag: {selectedTag}</p>
                      <p className="text-xs text-muted-foreground">{filteredTotalQty} items sold</p>
                    </div>
                    <p className="text-lg font-bold text-primary">{formatPrice(filteredTotalRevenue)}</p>
                  </div>
                  {Object.keys(filteredPaymentMethods).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">By Payment Method</p>
                      {Object.entries(filteredPaymentMethods).map(([method, data]) => (
                        <div key={method} className="flex items-center justify-between p-2 bg-muted rounded-lg text-sm">
                          <div>
                            <p className="font-medium">{method}</p>
                            <p className="text-xs text-muted-foreground">{data.count} order(s)</p>
                          </div>
                          <p className="font-bold text-primary">{formatPrice(data.total)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {Object.entries(itemsByCategory).map(([category, catItems]) => (
                <div key={category} className="mb-4">
                  <p className="text-sm font-medium text-muted-foreground mb-2">{category}</p>
                  <div className="space-y-2">
                    {catItems.map(([name, data]) => (
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
              ))}
            </div>
          </>
        )}

        {/* Top Customers */}
        {customerStats.length > 0 && customerStats.some(([name]) => name !== "Walk-in") && (
          <>
            <Separator />
            <div>
              <h3 className="font-semibold mb-4 text-lg">Top Customers</h3>
              <div className="space-y-3">
                {customerStats.filter(([name]) => name !== "Walk-in").map(([name, data]) => {
                  const topItem = Object.entries(data.items).sort(([, a], [, b]) => b - a)[0];
                  return (
                    <div key={name} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <p className="font-medium">{name}</p>
                        <p className="text-sm text-muted-foreground">
                          {data.count} order(s) {topItem ? `• Favorite: ${topItem[0]}` : ""}
                        </p>
                      </div>
                      <p className="text-lg font-bold text-primary">{formatPrice(data.total)}</p>
                    </div>
                  );
                })}
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
                      {order.customer_name && (
                        <CardDescription>Customer: {order.customer_name}</CardDescription>
                      )}
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
