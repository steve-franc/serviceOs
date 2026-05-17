import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, TrendingDown, Users, Calendar, Repeat, ArrowUpRight, ArrowDownRight, Receipt } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, isWithinInterval, differenceInCalendarDays } from "date-fns";
import { formatPrice } from "@/lib/currency";
import { formatDateFull, formatDateShort, daysInMonth, dailyShareOfMonthly } from "@/lib/date-format";
import { sumPaidRevenue, sumUnpaidRevenue, dailyBillsTarget } from "@/lib/revenue";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate, useNavigate } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

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
  description: string;
  created_at: string;
}

interface OrderData {
  total: number;
  customer_name: string | null;
  payment_method: string;
  payment_status?: string | null;
  status?: string | null;
  created_at: string;
}

const Reports = () => {
  const navigate = useNavigate();
  const { restaurantId, loading: restaurantLoading } = useRestaurantContext();
  const { isManager, isInvestor, canViewReports, loading: roleLoading } = useUserRole();
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [offset, setOffset] = useState(0); // 0 = current, 1 = last, etc.
  const [reports, setReports] = useState<ReportData[]>([]);
  const [expenses, setExpenses] = useState<ExpenseData[]>([]);
  const [prevExpenses, setPrevExpenses] = useState<ExpenseData[]>([]);
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
      // Previous comparable window for trend / % change analysis
      const spanMs = dateRange.end.getTime() - dateRange.start.getTime();
      const prevStart = new Date(dateRange.start.getTime() - spanMs - 1);
      const prevEnd = new Date(dateRange.start.getTime() - 1);

      const [reportsRes, expensesRes, prevExpensesRes, ordersRes, settingsRes] = await Promise.all([
        supabase.from("daily_reports").select("id, report_date, total_orders, total_revenue, created_at")
          .eq("restaurant_id", restaurantId)
          .gte("created_at", startStr).lte("created_at", endStr)
          .order("created_at", { ascending: true }),
        supabase.from("daily_expenses").select("amount, source, description, created_at")
          .eq("restaurant_id", restaurantId)
          .gte("created_at", startStr).lte("created_at", endStr),
        supabase.from("daily_expenses").select("amount, source, description, created_at")
          .eq("restaurant_id", restaurantId)
          .gte("created_at", prevStart.toISOString()).lte("created_at", prevEnd.toISOString()),
        supabase.from("orders").select("total, customer_name, payment_method, payment_status, status, created_at")
          .eq("restaurant_id", restaurantId).eq("status", "confirmed")
          .gte("created_at", startStr).lte("created_at", endStr),
        supabase.from("restaurant_settings").select("fixed_monthly_expenses")
          .eq("restaurant_id", restaurantId).maybeSingle(),
      ]);

      setReports(reportsRes.data || []);
      setExpenses(expensesRes.data as ExpenseData[] || []);
      setPrevExpenses(prevExpensesRes.data as ExpenseData[] || []);
      setOrders(ordersRes.data || []);
      setFixedMonthlyExpenses(Number((settingsRes.data as any)?.fixed_monthly_expenses) || 0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const totalRevenue = sumPaidRevenue(orders as any);
  const unpaidTotal = sumUnpaidRevenue(orders as any);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  // Daily share of monthly bills is fixed at /30 per business rule.
  const days = period === "week" ? 7 : daysInMonth(dateRange.start);
  const fixedDeduction = period === "month"
    ? fixedMonthlyExpenses
    : dailyBillsTarget(fixedMonthlyExpenses) * days;
  const totalDeductions = totalExpenses + fixedDeduction + unpaidTotal;
  const netProfit = totalRevenue - totalDeductions;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Expenses by source (current period)
  const expensesBySource: Record<string, number> = {};
  expenses.forEach(e => {
    const src = e.source || "Unspecified";
    expensesBySource[src] = (expensesBySource[src] || 0) + Number(e.amount);
  });

  // Previous-period totals by source — for % change comparison
  const prevExpensesBySource: Record<string, number> = {};
  prevExpenses.forEach(e => {
    const src = e.source || "Unspecified";
    prevExpensesBySource[src] = (prevExpensesBySource[src] || 0) + Number(e.amount);
  });
  const prevExpensesTotal = prevExpenses.reduce((s, e) => s + Number(e.amount), 0);

  // Recurrence detection: how many distinct days each source appears in current period
  const recurrenceBySource: Record<string, { days: Set<string>; count: number }> = {};
  expenses.forEach(e => {
    const src = e.source || "Unspecified";
    const day = (e.created_at || "").slice(0, 10);
    if (!recurrenceBySource[src]) recurrenceBySource[src] = { days: new Set(), count: 0 };
    recurrenceBySource[src].days.add(day);
    recurrenceBySource[src].count++;
  });

  // Combined per-source insight rows
  const expenseInsights = Object.keys({ ...expensesBySource, ...prevExpensesBySource }).map(src => {
    const current = expensesBySource[src] || 0;
    const previous = prevExpensesBySource[src] || 0;
    const delta = current - previous;
    const pct = previous > 0 ? (delta / previous) * 100 : (current > 0 ? 100 : 0);
    const rec = recurrenceBySource[src];
    const distinctDays = rec ? rec.days.size : 0;
    const occurrences = rec ? rec.count : 0;
    const isRecurring = distinctDays >= 2 || occurrences >= 3;
    return { source: src, current, previous, delta, pct, distinctDays, occurrences, isRecurring };
  }).sort((a, b) => b.current - a.current);

  // Chart data: current vs previous per source (top 8)
  const expenseChartData = expenseInsights.slice(0, 8).map(r => ({
    name: r.source.length > 14 ? r.source.slice(0, 13) + "…" : r.source,
    Current: Number(r.current.toFixed(2)),
    Previous: Number(r.previous.toFixed(2)),
  }));
  const totalPctChange = prevExpensesTotal > 0
    ? ((totalExpenses - prevExpensesTotal) / prevExpensesTotal) * 100
    : (totalExpenses > 0 ? 100 : 0);

  // Payment methods
  const pmBreakdown: Record<string, { count: number; total: number }> = {};
  // Payment methods (only paid orders contribute)
  orders.forEach(o => {
    if ((o.payment_status ?? "paid") !== "paid") return;
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
    return <><div className="flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground">Loading...</p></div></>;
  }
  if (!canViewReports) return <Navigate to="/" replace />;

  return (
    <>
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
            {(Object.keys(expensesBySource).length > 0 || fixedDeduction > 0 || unpaidTotal > 0) && (
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
                          <p className="text-xs text-muted-foreground">{formatPrice(fixedMonthlyExpenses)}/month ÷ 30</p>
                        </div>
                        <p className="text-lg font-bold text-destructive">-{formatPrice(fixedDeduction)}</p>
                      </div>
                    )}
                    {unpaidTotal > 0 && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <p className="font-medium">Unpaid Orders</p>
                          <p className="text-xs text-muted-foreground">Tracked in Debtors</p>
                        </div>
                        <p className="text-lg font-bold text-destructive">-{formatPrice(unpaidTotal)}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Expense Insights */}
            {expenseInsights.length > 0 && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <Receipt className="h-5 w-5" />
                      Expense Insights
                    </h3>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">vs previous {period}:</span>
                      <Badge variant={totalPctChange > 0 ? "destructive" : "secondary"} className="gap-1">
                        {totalPctChange > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {totalPctChange > 0 ? "+" : ""}{totalPctChange.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>

                  {/* Chart: Current vs Previous by source */}
                  {expenseChartData.length > 0 && (
                    <Card className="mb-4">
                      <CardContent className="pt-6">
                        <div className="h-64 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={expenseChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                              <Tooltip
                                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                                formatter={(v: number) => formatPrice(Number(v))}
                              />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                              <Bar dataKey="Previous" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="Current" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Per-source insight rows */}
                  <div className="space-y-2">
                    {expenseInsights.map(row => {
                      const up = row.delta > 0;
                      const down = row.delta < 0;
                      return (
                        <div key={row.source} className="flex items-center justify-between p-3 bg-muted rounded-lg gap-3 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="font-medium truncate">{row.source}</p>
                            {row.isRecurring && (
                              <Badge variant="outline" className="gap-1 text-xs">
                                <Repeat className="h-3 w-3" />
                                Recurring
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <div className="text-right">
                              <p className="text-muted-foreground text-xs">Prev</p>
                              <p className="font-mono">{formatPrice(row.previous)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-muted-foreground text-xs">Current</p>
                              <p className="font-mono font-semibold">{formatPrice(row.current)}</p>
                            </div>
                            <Badge
                              variant={up ? "destructive" : down ? "secondary" : "outline"}
                              className="gap-1 min-w-[72px] justify-center"
                            >
                              {up ? <ArrowUpRight className="h-3 w-3" /> : down ? <ArrowDownRight className="h-3 w-3" /> : null}
                              {row.previous === 0 && row.current === 0
                                ? "—"
                                : `${up ? "+" : ""}${row.pct.toFixed(1)}%`}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-xs text-muted-foreground mt-3">
                    "Recurring" = same source charged on 2+ different days or 3+ times this {period}.
                    Percentages compare against the previous {period}.
                  </p>
                </div>
              </>
            )}

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
    </>
  );
};

export default Reports;
