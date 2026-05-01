import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { StatCard } from "@/components/superadmin/StatCard";
import { StatusBadge } from "@/components/superadmin/StatusBadge";
import { useSuperOverview, useSuperRestaurants, useSuperOrders, useSuperDailyTrend, useSuperTopProducts } from "@/hooks/useSuperadminData";
import { ShoppingCart, DollarSign, Store, TrendingUp } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/currency";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function SuperDashboard() {
  const { data: overview, isLoading: ovLoading } = useSuperOverview();
  const { data: restaurants } = useSuperRestaurants();
  const { data: orders, isLoading: ordLoading } = useSuperOrders(50);
  const { data: trend, isLoading: trLoading } = useSuperDailyTrend(30);
  const { data: products, isLoading: prLoading } = useSuperTopProducts(6);

  const totalRev = Number(overview?.revenue_total ?? 0);
  const totalOrd = Number(overview?.orders_total ?? 0);
  const aov = totalOrd > 0 ? totalRev / totalOrd : 0;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">God Mode Dashboard</h1>
            <p className="text-sm text-muted-foreground">Platform-wide oversight</p>
          </div>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {ovLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          ) : (
            <>
              <StatCard label="Total Revenue" value={formatPrice(totalRev)} icon={<DollarSign className="h-4 w-4" />} />
              <StatCard label="Total Orders" value={totalOrd.toLocaleString()} icon={<ShoppingCart className="h-4 w-4" />} />
              <StatCard label="Businesses" value={String(overview?.restaurants_total ?? 0)} sub={`${overview?.restaurants_active ?? 0} active`} icon={<Store className="h-4 w-4" />} />
              <StatCard label="Avg Order Value" value={formatPrice(aov)} icon={<TrendingUp className="h-4 w-4" />} />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-card p-5 border border-border shadow-sm">
            <h2 className="text-sm font-semibold mb-4">Revenue (30 days)</h2>
            {trLoading ? <Skeleton className="h-[220px]" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).getDate().toString()} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `₺${(Number(v) / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatPrice(Number(v))} labelFormatter={(l) => new Date(l).toLocaleDateString()} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Area type="monotone" dataKey="total_revenue" stroke="hsl(var(--primary))" fill="url(#revGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-xl bg-card p-5 border border-border shadow-sm">
            <h2 className="text-sm font-semibold mb-4">Orders (30 days)</h2>
            {trLoading ? <Skeleton className="h-[220px]" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).getDate().toString()} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip labelFormatter={(l) => new Date(l).toLocaleDateString()} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="total_orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">Recent Orders</h2>
              <Link to="/superadmin/orders" className="text-xs font-medium text-primary hover:underline">View all</Link>
            </div>
            <div className="divide-y divide-border">
              {ordLoading ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 mx-5 my-2" />)
              ) : (
                orders?.slice(0, 6).map((o: any) => (
                  <div key={o.id} className="flex items-center justify-between px-5 py-3 hover:bg-accent/50 transition-colors">
                    <div>
                      <p className="text-sm font-medium font-mono">#{o.order_number}</p>
                      <p className="text-xs text-muted-foreground">{o.restaurant_name} · {fmtTime(o.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium font-mono">{formatPrice(Number(o.total))}</span>
                      <StatusBadge status={o.status} />
                    </div>
                  </div>
                ))
              )}
              {!ordLoading && (!orders || orders.length === 0) && (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">No orders yet</div>
              )}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">Top Products</h2>
              <Link to="/superadmin/products" className="text-xs font-medium text-primary hover:underline">View all</Link>
            </div>
            <div className="divide-y divide-border">
              {prLoading ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 mx-5 my-2" />)
              ) : (
                products?.slice(0, 6).map((p: any, i: number) => (
                  <div key={p.menu_item_name} className="flex items-center justify-between px-5 py-3 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">{i + 1}</span>
                      <div>
                        <p className="text-sm font-medium">{p.menu_item_name}</p>
                        <p className="text-xs text-muted-foreground">{p.total_sold} sold</p>
                      </div>
                    </div>
                    <span className="text-sm font-medium font-mono">{formatPrice(Number(p.revenue))}</span>
                  </div>
                ))
              )}
              {!prLoading && (!products || products.length === 0) && (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">No data yet</div>
              )}
            </div>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">Businesses</h2>
            <Link to="/superadmin/restaurants" className="text-xs font-medium text-primary hover:underline">Manage all</Link>
          </div>
          <div className="divide-y divide-border">
            {restaurants?.slice(0, 6).map((r: any) => (
              <Link key={r.id} to={`/superadmin/restaurants/${r.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-accent/50 transition-colors">
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.staff_count} staff · {r.orders_count} orders</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium font-mono">{formatPrice(Number(r.revenue || 0))}</span>
                  <StatusBadge status={r.status} />
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
    </Layout>
  );
}
