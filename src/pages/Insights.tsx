import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, ChevronLeft, DollarSign, Package, Wallet, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatPrice } from "@/lib/currency";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate, Link } from "react-router-dom";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subDays,
  format,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachHourOfInterval,
  isSameHour,
  isSameDay,
  isSameMonth,
  addDays,
  addMonths,
  addYears,
} from "date-fns";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/PageSkeleton";

type Period = "day" | "week" | "month" | "year";

interface OrderRow {
  id: string;
  total: number;
  payment_method: string;
  payment_status: string;
  status: string;
  created_at: string;
  customer_name: string | null;
}
interface RestockRow {
  id: string;
  total_cost: number;
  purchase_date: string;
  quantity_purchased: number;
  unit_type: string;
  daily_expense_id: string | null;
  supplier_id: string | null;
  inventory_item_id: string;
}
interface ExpenseRow {
  id: string;
  amount: number;
  description: string;
  category: string | null;
  source: string | null;
  created_at: string;
}

const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

export default function Insights() {
  const { restaurantId, loading: ctxLoading } = useRestaurantContext();
  const { isManager, isInvestor, loading: roleLoading } = useUserRole();
  const [period, setPeriod] = useState<Period>("month");
  const [offset, setOffset] = useState(0); // 0 = current, -1 = previous, etc.
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [restocks, setRestocks] = useState<RestockRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, string>>({});
  const [items, setItems] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Reset offset when switching period
  useEffect(() => { setOffset(0); }, [period]);

  const range = useMemo(() => {
    const now = new Date();
    if (period === "day") {
      const d = addDays(now, offset);
      return { start: startOfDay(d), end: endOfDay(d) };
    }
    if (period === "week") {
      const end = addDays(now, offset * 7);
      return { start: startOfDay(subDays(end, 6)), end: endOfDay(end) };
    }
    if (period === "month") {
      const d = addMonths(now, offset);
      return { start: startOfMonth(d), end: endOfMonth(d) };
    }
    const d = addYears(now, offset);
    return { start: startOfYear(d), end: endOfYear(d) };
  }, [period, offset]);

  const rangeLabel = useMemo(() => {
    if (period === "day") return format(range.start, "EEEE, MMM d, yyyy");
    if (period === "week") return `${format(range.start, "MMM d")} – ${format(range.end, "MMM d, yyyy")}`;
    if (period === "month") return format(range.start, "MMMM yyyy");
    return format(range.start, "yyyy");
  }, [period, range]);


  useEffect(() => {
    if (!restaurantId) return;
    let cancel = false;
    const load = async () => {
      setLoading(true);
      const startISO = range.start.toISOString();
      const endISO = range.end.toISOString();
      const startDate = format(range.start, "yyyy-MM-dd");
      const endDate = format(range.end, "yyyy-MM-dd");

      const [ordersRes, restockRes, expRes, supRes, itemRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id,total,payment_method,payment_status,status,created_at,customer_name")
          .eq("restaurant_id", restaurantId)
          .gte("created_at", startISO)
          .lte("created_at", endISO),
        supabase
          .from("restock_entries")
          .select("id,total_cost,purchase_date,quantity_purchased,unit_type,daily_expense_id,supplier_id,inventory_item_id")
          .eq("restaurant_id", restaurantId)
          .gte("purchase_date", startDate)
          .lte("purchase_date", endDate),
        supabase
          .from("daily_expenses")
          .select("id,amount,description,category,source,created_at")
          .eq("restaurant_id", restaurantId)
          .gte("created_at", startISO)
          .lte("created_at", endISO),
        supabase.from("suppliers").select("id,supplier_name").eq("restaurant_id", restaurantId),
        supabase.from("inventory").select("id,name").eq("restaurant_id", restaurantId),
      ]);

      if (cancel) return;
      setOrders((ordersRes.data as OrderRow[]) || []);
      setRestocks((restockRes.data as RestockRow[]) || []);
      setExpenses((expRes.data as ExpenseRow[]) || []);
      setSuppliers(Object.fromEntries(((supRes.data as any[]) || []).map((s) => [s.id, s.supplier_name])));
      setItems(Object.fromEntries(((itemRes.data as any[]) || []).map((i) => [i.id, i.name])));
      setLoading(false);
    };
    load();

    // Realtime
    const ch = supabase
      .channel(`insights-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "restock_entries", filter: `restaurant_id=eq.${restaurantId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_expenses", filter: `restaurant_id=eq.${restaurantId}` }, load)
      .subscribe();
    return () => {
      cancel = true;
      supabase.removeChannel(ch);
    };
  }, [restaurantId, range.start.getTime(), range.end.getTime()]);

  // Paid orders only
  const paidOrders = useMemo(
    () => orders.filter((o) => (o.status ?? "confirmed") === "confirmed" && (o.payment_status ?? "paid") === "paid"),
    [orders],
  );

  // Avoid double-counting restock-linked expenses
  const restockLinkedExpenseIds = useMemo(
    () => new Set(restocks.map((r) => r.daily_expense_id).filter(Boolean) as string[]),
    [restocks],
  );
  const standaloneExpenses = useMemo(
    () => expenses.filter((e) => !restockLinkedExpenseIds.has(e.id)),
    [expenses, restockLinkedExpenseIds],
  );

  const totalRevenue = paidOrders.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalRestock = restocks.reduce((s, r) => s + Number(r.total_cost || 0), 0);
  const totalStandaloneExp = standaloneExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalExpenses = totalRestock + totalStandaloneExp;
  const expenseCount = restocks.length + standaloneExpenses.length;
  const netProfit = totalRevenue - totalExpenses;
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Bucketing
  const buckets = useMemo(() => {
    if (period === "day") {
      const hours = eachHourOfInterval({ start: range.start, end: range.end });
      return hours.map((h) => ({ date: h, label: format(h, "HH:mm") }));
    }
    if (period === "year") {
      const months = eachMonthOfInterval({ start: range.start, end: range.end });
      return months.map((m) => ({ date: m, label: format(m, "MMM") }));
    }
    const days = eachDayOfInterval({ start: range.start, end: range.end });
    return days.map((d) => ({ date: d, label: format(d, period === "month" ? "MMM d" : "MMM d") }));
  }, [period, range]);

  const chartData = useMemo(() => {
    let cumRev = 0;
    let cumExp = 0;
    return buckets.map(({ date, label }) => {
      const match = (d: Date) => {
        if (period === "day") return isSameHour(d, date);
        if (period === "year") return isSameMonth(d, date);
        return isSameDay(d, date);
      };
      const rev = paidOrders
        .filter((o) => match(new Date(o.created_at)))
        .reduce((s, o) => s + Number(o.total || 0), 0);
      const revCount = paidOrders.filter((o) => match(new Date(o.created_at))).length;
      const restockExp = restocks
        .filter((r) => match(period === "day" ? new Date(r.purchase_date) : new Date(r.purchase_date + "T00:00:00")))
        .reduce((s, r) => s + Number(r.total_cost || 0), 0);
      const standExp = standaloneExpenses
        .filter((e) => match(new Date(e.created_at)))
        .reduce((s, e) => s + Number(e.amount || 0), 0);
      const exp = restockExp + standExp;
      const expCount =
        restocks.filter((r) =>
          match(period === "day" ? new Date(r.purchase_date) : new Date(r.purchase_date + "T00:00:00")),
        ).length +
        standaloneExpenses.filter((e) => match(new Date(e.created_at))).length;
      cumRev += rev;
      cumExp += exp;
      return { label, revenue: rev, revCount, expense: exp, expCount, cumRev, cumExp };
    });
  }, [buckets, paidOrders, restocks, standaloneExpenses, period]);

  // Expense breakdown by supplier / category
  const expenseGroups = useMemo(() => {
    const map = new Map<string, { name: string; total: number; entries: Array<{ date: string; description: string; amount: number }> }>();
    for (const r of restocks) {
      const key = r.supplier_id ? `sup:${r.supplier_id}` : "sup:unknown";
      const name = r.supplier_id ? suppliers[r.supplier_id] || "Unknown Supplier" : "Unknown Supplier";
      if (!map.has(key)) map.set(key, { name, total: 0, entries: [] });
      const g = map.get(key)!;
      g.total += Number(r.total_cost || 0);
      g.entries.push({
        date: r.purchase_date,
        description: `${items[r.inventory_item_id] || "Item"} × ${r.quantity_purchased} ${r.unit_type}`,
        amount: Number(r.total_cost || 0),
      });
    }
    for (const e of standaloneExpenses) {
      const cat = e.category || e.source || "Other";
      const key = `cat:${cat}`;
      if (!map.has(key)) map.set(key, { name: cat, total: 0, entries: [] });
      const g = map.get(key)!;
      g.total += Number(e.amount || 0);
      g.entries.push({ date: e.created_at, description: e.description, amount: Number(e.amount || 0) });
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v, count: v.entries.length }))
      .sort((a, b) => b.total - a.total);
  }, [restocks, standaloneExpenses, suppliers, items]);

  // Revenue breakdown by payment method
  const revenueGroups = useMemo(() => {
    const map = new Map<string, { name: string; total: number; entries: Array<{ date: string; description: string; amount: number }> }>();
    for (const o of paidOrders) {
      const key = o.payment_method || "Unknown";
      if (!map.has(key)) map.set(key, { name: key, total: 0, entries: [] });
      const g = map.get(key)!;
      g.total += Number(o.total || 0);
      g.entries.push({
        date: o.created_at,
        description: o.customer_name || "Order",
        amount: Number(o.total || 0),
      });
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v, count: v.entries.length }))
      .sort((a, b) => b.total - a.total);
  }, [paidOrders]);

  const days = Math.max(
    1,
    period === "day" ? 1 : period === "week" ? 7 : period === "month" ? buckets.length : 12,
  );
  const avgDaily = netProfit / days;

  if (ctxLoading || roleLoading) return <PageSkeleton />;
  if (!isManager && !isInvestor) return <Navigate to="/order/create" replace />;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Link to="/dashboard" className="hover:text-foreground">serviceOS</Link>
          <span>›</span>
          <span>Finance</span>
          <span>›</span>
          <span className="text-foreground">Insights</span>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Financial Insights</h1>
            <p className="text-sm text-muted-foreground">Monthly revenue, expenses, and profit trends</p>
          </div>
          <div className="flex flex-wrap gap-1.5 bg-muted/40 p-1 rounded-full w-fit">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={cn(
                  "px-4 py-1.5 text-sm rounded-full transition-all min-h-[36px]",
                  period === p.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <StatCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Total Revenue"
          value={formatPrice(totalRevenue)}
          sub={`${paidOrders.length} orders`}
          tone="accent2"
        />
        <StatCard
          icon={<Package className="h-4 w-4" />}
          label="Total Expenses"
          value={formatPrice(totalExpenses)}
          sub={`${expenseCount} entries`}
          tone="danger"
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="Net Profit"
          value={formatPrice(netProfit)}
          sub={`${margin.toFixed(1)}% margin`}
          tone={netProfit >= 0 ? "accent2" : "danger"}
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Avg Daily"
          value={`${formatPrice(avgDaily)}/day`}
          sub="Average per day"
          tone="accent"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Revenue Breakdown"
          subtitle={`Orders by ${periodLabel(period)}`}
          data={chartData}
          barKey="revenue"
          barCountKey="revCount"
          lineKey="cumRev"
          barColor="hsl(var(--accent2))"
          lineColor="hsl(var(--primary))"
          barName="Revenue"
          lineName="Cumulative"
        />
        <ChartCard
          title="Expense Breakdown"
          subtitle={`Expenses by ${periodLabel(period)}`}
          data={chartData}
          barKey="expense"
          barCountKey="expCount"
          lineKey="cumExp"
          barColor="hsl(var(--destructive))"
          lineColor="hsl(var(--destructive) / 0.6)"
          barName="Expenses"
          lineName="Cumulative"
        />
      </div>

      {/* Tables */}
      <BreakdownTable
        title="Expense Details"
        subtitle="Breakdown by supplier or category"
        groups={expenseGroups}
        totalColor="text-destructive"
        emptyText={loading ? "Loading…" : "No expenses in this period"}
      />
      <BreakdownTable
        title="Revenue Details"
        subtitle="Breakdown by payment method"
        groups={revenueGroups}
        totalColor="text-accent2"
        emptyText={loading ? "Loading…" : "No revenue in this period"}
      />
    </div>
  );
}

function periodLabel(p: Period) {
  return p === "day" ? "Hour" : p === "week" ? "Day" : p === "month" ? "Day" : "Month";
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "accent" | "accent2" | "danger";
}) {
  const toneClass =
    tone === "accent2" ? "text-accent2" : tone === "danger" ? "text-destructive" : "text-primary";
  return (
    <Card>
      <CardContent className="p-4 space-y-1.5">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium">{label}</span>
          <span className={toneClass}>{icon}</span>
        </div>
        <div className={cn("text-xl md:text-2xl font-bold font-mono tabular-nums", toneClass)}>{value}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  subtitle,
  data,
  barKey,
  barCountKey,
  lineKey,
  barColor,
  lineColor,
  barName,
  lineName,
}: {
  title: string;
  subtitle: string;
  data: any[];
  barKey: string;
  barCountKey: string;
  lineKey: string;
  barColor: string;
  lineColor: string;
  barName: string;
  lineName: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="p-3 md:p-4">
        <div className="h-[280px] md:h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: any, name: string, props: any) => {
                  if (name === barName) {
                    return [`${formatPrice(Number(value))} (${props.payload?.[barCountKey] ?? 0})`, name];
                  }
                  return [formatPrice(Number(value)), name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey={barKey} name={barName} fill={barColor} radius={[4, 4, 0, 0]} animationDuration={400} />
              <Line
                type="monotone"
                dataKey={lineKey}
                name={lineName}
                stroke={lineColor}
                strokeWidth={2}
                dot={false}
                animationDuration={400}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownTable({
  title,
  subtitle,
  groups,
  totalColor,
  emptyText,
}: {
  title: string;
  subtitle: string;
  groups: Array<{ key: string; name: string; total: number; count: number; entries: Array<{ date: string; description: string; amount: number }> }>;
  totalColor: string;
  emptyText: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {groups.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          <div className="divide-y">
            {groups.map((g) => {
              const isOpen = !!open[g.key];
              return (
                <Collapsible key={g.key} open={isOpen} onOpenChange={(v) => setOpen((s) => ({ ...s, [g.key]: v }))}>
                  <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left">
                    <div className="flex items-center gap-2 min-w-0">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-medium truncate">{g.name}</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <Badge variant="secondary" className="text-xs">
                        {g.count} {g.count === 1 ? "entry" : "entries"}
                      </Badge>
                      <span className={cn("font-mono tabular-nums font-semibold", totalColor)}>
                        {formatPrice(g.total)}
                      </span>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="bg-muted/20 px-4 py-2 space-y-1.5">
                      {g.entries.map((e, i) => (
                        <div key={i} className="flex items-center justify-between text-sm gap-3">
                          <div className="min-w-0 flex-1 flex items-center gap-3 text-muted-foreground">
                            <span className="text-xs tabular-nums shrink-0">{format(new Date(e.date), "MMM d")}</span>
                            <span className="truncate text-foreground/80">{e.description}</span>
                          </div>
                          <span className={cn("font-mono tabular-nums", totalColor)}>{formatPrice(e.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
