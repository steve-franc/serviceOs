import Layout from "@/components/Layout";
import { StatCard } from "@/components/superadmin/StatCard";
import { useSuperOverview, useSuperRestaurants, useSuperDailyTrend, useSuperOrders } from "@/hooks/useSuperadminData";
import { BarChart3, TrendingUp, ShoppingCart, DollarSign } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";
import { formatPrice } from "@/lib/currency";

const PIE = ["hsl(var(--primary))", "hsl(var(--primary) / 0.75)", "hsl(var(--primary) / 0.55)", "hsl(var(--primary) / 0.35)", "hsl(var(--primary) / 0.2)"];

export default function SuperAnalytics() {
  const { data: ov } = useSuperOverview();
  const { data: restaurants } = useSuperRestaurants();
  const { data: trend, isLoading: trLoading } = useSuperDailyTrend(30);
  const { data: orders, isLoading: ordLoading } = useSuperOrders(500);

  const totalRev = Number(ov?.revenue_total ?? 0);
  const totalOrd = Number(ov?.orders_total ?? 0);
  const avgDaily = trend && trend.length > 0 ? totalRev / trend.length : 0;

  const paymentData = useMemo(() => {
    if (!orders) return [];
    const map = new Map<string, number>();
    for (const o of orders) map.set(o.payment_method, (map.get(o.payment_method) ?? 0) + 1);
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [orders]);

  const ordersByHour = useMemo(() => {
    if (!orders) return [];
    const m = new Map<number, number>();
    for (const o of orders) {
      const h = new Date(o.created_at).getHours();
      m.set(h, (m.get(h) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]).map(([hour, c]) => ({ hour: `${hour}:00`, orders: c }));
  }, [orders]);

  const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 } as const;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Performance across all restaurants</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Avg Daily Revenue" value={formatPrice(avgDaily)} icon={<DollarSign className="h-4 w-4" />} />
          <StatCard label="Avg Daily Orders" value={String(trend && trend.length > 0 ? Math.round(totalOrd / trend.length) : 0)} icon={<ShoppingCart className="h-4 w-4" />} />
          <StatCard label="Total Revenue" value={formatPrice(totalRev)} icon={<TrendingUp className="h-4 w-4" />} />
          <StatCard label="Total Orders" value={totalOrd.toLocaleString()} icon={<BarChart3 className="h-4 w-4" />} />
        </div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-card p-5 border border-border shadow-sm">
          <h2 className="text-sm font-semibold mb-4">Revenue Trend (30 days)</h2>
          {trLoading ? <Skeleton className="h-[280px]" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).getDate().toString()} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `₺${(Number(v) / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatPrice(Number(v))} labelFormatter={(l) => new Date(l).toLocaleDateString()} contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="total_revenue" stroke="hsl(var(--primary))" fill="url(#aGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-xl bg-card p-5 border border-border shadow-sm">
            <h2 className="text-sm font-semibold mb-4">Orders by Hour</h2>
            {ordLoading ? <Skeleton className="h-[220px]" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={ordersByHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl bg-card p-5 border border-border shadow-sm">
            <h2 className="text-sm font-semibold mb-4">Payment Methods</h2>
            {ordLoading ? <Skeleton className="h-[220px]" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={paymentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={50} paddingAngle={4}>
                    {paymentData.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-xl bg-card p-5 border border-border shadow-sm">
          <h2 className="text-sm font-semibold mb-4">Revenue by Restaurant</h2>
          <ResponsiveContainer width="100%" height={Math.max(250, (restaurants?.length ?? 0) * 32)}>
            <BarChart data={restaurants?.map((r: any) => ({ name: r.name, revenue: Number(r.revenue || 0) }))} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `₺${(Number(v) / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={140} />
              <Tooltip formatter={(v: number) => formatPrice(Number(v))} contentStyle={tooltipStyle} />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
    </Layout>
  );
}
