import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, TrendingDown, Users, Calendar } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, isWithinInterval } from "date-fns";
import { formatPrice } from "@/lib/currency";
import { formatDateFull, formatDateShort } from "@/lib/date-format";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate, useNavigate } from "react-router-dom";

interface ReportData {
  id: string;
  report_date: string;
  total_orders: number;
  total_revenue: number;
  created_at: string;
}

interface ExpenseData {
  amount: number;
  source: string | null;
  created_at: string;
}

interface OrderData {
  total: number;
  customer_name: string | null;
  payment_method: string;
  created_at: string;
}

const Reports = () => {
  const navigate = useNavigate();
  const { restaurantId, loading: restaurantLoading } = useRestaurantContext();
  const { isManager, loading: roleLoading } = useUserRole();
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [offset, setOffset] = useState(0); // 0 = current, 1 = last, etc.
  const [reports, setReports] = useState<ReportData[]>([]);
  const [expenses, setExpenses] = useState<ExpenseData[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [fixedMonthlyExpenses, setFixedMonthlyExpenses] = useState(0);
  const [loading, setLoading] = useState(true);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (period === "week") {
      const ref = subWeeks(now, offset);
      return { start: startOfWeek(ref, { weekStartsOn: 1 }), end: endOfWeek(ref, { weekStartsOn: 1 }) };
    } else {
      const ref = subMonths(now, offset);
      return { start: startOfMonth(ref), end: endOfMonth(ref) };
    }
  }, [period, offset]);

  useEffect(() => {
    if (restaurantId) fetchData();
  }, [restaurantId, dateRange]);

  const fetchData = async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const startStr = dateRange.start.toISOString();
      const endStr = dateRange.end.toISOString();

      const [reportsRes, expensesRes, ordersRes, settingsRes] = await Promise.all([
        supabase.from("daily_reports").select("id, report_date, total_orders, total_revenue, created_at")
          .eq("restaurant_id", restaurantId)
          .gte("created_at", startStr).lte("created_at", endStr)
          .order("created_at", { ascending: true }),
        supabase.from("daily_expenses").select("amount, source, created_at")
          .eq("restaurant_id", restaurantId)
          .gte("created_at", startStr).lte("created_at", endStr),
        supabase.from("orders").select("total, customer_name, payment_method, created_at")
          .eq("restaurant_id", restaurantId).eq("status", "confirmed")
          .gte("created_at", startStr).lte("created_at", endStr),
        supabase.from("restaurant_settings").select("fixed_monthly_expenses")
          .eq("restaurant_id", restaurantId).maybeSingle(),
      ]);

      setReports(reportsRes.data || []);
      setExpenses(expensesRes.data as ExpenseData[] || []);
      setOrders(ordersRes.data || []);
      setFixedMonthlyExpenses(Number((settingsRes.data as any)?.fixed_monthly_expenses) || 0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const days = period === "week" ? 7 : new Date(dateRange.start.getFullYear(), dateRange.start.getMonth() + 1, 0).getDate();
  const fixedDeduction = period === "month" ? fixedMonthlyExpenses : (fixedMonthlyExpenses / 30) * days;
  const totalDeductions = totalExpenses + fixedDeduction;
  const netProfit = totalRevenue - totalDeductions;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Expenses by source
  const expensesBySource: Record<string, number> = {};
  expenses.forEach(e => {
    const src = e.source || "Unspecified";
    expensesBySource[src] = (expensesBySource[src] || 0) + Number(e.amount);
  });

  // Payment methods
  const pmBreakdown: Record<string, { count: number; total: number }> = {};
  orders.forEach(o => {
    if (!pmBreakdown[o.payment_method]) pmBreakdown[o.payment_method] = { count: 0, total: 0 };
    pmBreakdown[o.payment_method].count++;
    pmBreakdown[o.payment_method].total += Number(o.total);
  });

  // Top customers
  const customerMap: Record<string, { count: number; total: number }> = {};
  orders.forEach(o => {
    const name = o.customer_name || "Walk-in";
    if (!customerMap[name]) customerMap[name] = { count: 0, total: 0 };
    customerMap[name].count++;
    customerMap[name].total += Number(o.total);
  });
  const topCustomers = Object.entries(customerMap)
    .filter(([name]) => name !== "Walk-in")
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 5);

  if (roleLoading || restaurantLoading) {
    return <Layout><div className="flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground">Loading...</p></div></Layout>;
  }
  if (!isManager) return <Navigate to="/" replace />;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <BarChart3 className="h-7 w-7" />
              {period === "week" ? "Weekly" : "Monthly"} Report
            </h2>
            <p className="text-muted-foreground">
              {formatDateShort(dateRange.start)} — {formatDateShort(dateRange.end)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(v) => { setPeriod(v as any); setOffset(0); }}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Weekly</SelectItem>
                <SelectItem value="month">Monthly</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setOffset(o => o + 1)}>← Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setOffset(o => Math.max(0, o - 1))} disabled={offset === 0}>Next →</Button>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading...</p>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Revenue</CardDescription>
                  <CardTitle className="text-2xl text-primary">{formatPrice(totalRevenue)}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Expenses</CardDescription>
                  <CardTitle className="text-2xl text-destructive">{formatPrice(totalDeductions)}</CardTitle>
                </CardHeader>
              </Card>
              <Card className={netProfit >= 0 ? "border-green-500/30" : "border-destructive/30"}>
                <CardHeader className="pb-3">
                  <CardDescription className="flex items-center gap-1">
                    {netProfit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    Net Profit
                  </CardDescription>
                  <CardTitle className={`text-2xl ${netProfit >= 0 ? "text-green-600" : "text-destructive"}`}>
                    {formatPrice(netProfit)}
                  </CardTitle>
                  <CardDescription className="text-xs">{profitMargin.toFixed(1)}% margin</CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Total Orders</CardDescription>
                  <CardTitle className="text-2xl">{orders.length}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            {/* Payment Methods */}
            {Object.keys(pmBreakdown).length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-3 text-lg">Payment Methods</h3>
                  <div className="space-y-2">
                    {Object.entries(pmBreakdown).map(([method, data]) => (
                      <div key={method} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <p className="font-medium">{method}</p>
                          <p className="text-sm text-muted-foreground">{data.count} orders</p>
                        </div>
                        <p className="text-lg font-bold text-primary">{formatPrice(data.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Expense Breakdown */}
            {(Object.keys(expensesBySource).length > 0 || fixedDeduction > 0) && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-3 text-lg">Expense Breakdown</h3>
                  <div className="space-y-2">
                    {Object.entries(expensesBySource).map(([src, total]) => (
                      <div key={src} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <p className="font-medium">{src}</p>
                        <p className="text-lg font-bold text-destructive">-{formatPrice(total)}</p>
                      </div>
                    ))}
                    {fixedDeduction > 0 && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <p className="font-medium">Fixed Costs ({days} days)</p>
                          <p className="text-xs text-muted-foreground">{formatPrice(fixedMonthlyExpenses)}/month</p>
                        </div>
                        <p className="text-lg font-bold text-destructive">-{formatPrice(fixedDeduction)}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Top Customers */}
            {topCustomers.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-3 text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Top Customers
                  </h3>
                  <div className="space-y-2">
                    {topCustomers.map(([name, data], i) => (
                      <div key={name} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="text-xs">#{i + 1}</Badge>
                          <div>
                            <p className="font-medium">{name}</p>
                            <p className="text-sm text-muted-foreground">{data.count} orders</p>
                          </div>
                        </div>
                        <p className="text-lg font-bold text-primary">{formatPrice(data.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Daily Reports List */}
            {reports.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-3 text-lg">Daily Reports</h3>
                  <div className="space-y-2">
                    {reports.map(report => (
                      <div key={report.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <p className="font-medium">{formatDateShort(report.created_at)}</p>
                          <p className="text-sm text-muted-foreground">{report.total_orders} orders</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-lg font-bold text-primary">{formatPrice(report.total_revenue)}</p>
                          <Button size="sm" variant="outline" onClick={() => navigate(`/report/${report.id}`)}>
                            View
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default Reports;
