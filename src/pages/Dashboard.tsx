import { useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useUserRole, useRestaurantContext } from "@/hooks/useRestaurantAndRole";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, ShoppingCart, CalendarClock, Users, ArrowUpRight } from "lucide-react";
import { formatPrice as formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

function StatCard({
  label, value, change, changeKind, Icon, accent,
}: {
  label: string; value: string; change?: string;
  changeKind?: "up" | "down" | "neutral"; Icon: any;
  accent: "brand" | "accent2" | "accent3" | "danger";
}) {
  const accentMap = {
    brand: "border-t-brand",
    accent2: "border-t-accent2",
    accent3: "border-t-accent3",
    danger: "border-t-danger",
  };
  return (
    <div className={cn(
      "relative bg-bg2 border border-border rounded-xl p-4 border-t-2 overflow-hidden",
      accentMap[accent],
    )}>
      <Icon className="absolute top-3 right-3 h-5 w-5 opacity-20" />
      <p className="text-[11px] uppercase tracking-[0.5px] text-muted-foreground font-medium">{label}</p>
      <p className="mt-2 text-[24px] font-bold font-mono tracking-tight break-all">{value}</p>
      {change && (
        <p className={cn(
          "mt-1 text-[12px] flex items-center gap-1 font-medium",
          changeKind === "up" && "text-accent2",
          changeKind === "down" && "text-danger",
          changeKind === "neutral" && "text-muted-foreground",
        )}>
          {changeKind === "up" && <ArrowUpRight className="h-3 w-3" />}
          {change}
        </p>
      )}
    </div>
  );
}

function startOfDayIso() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
}

const Overview = () => {
  const navigate = useNavigate();
  const { role, loading, isSuperadmin } = useUserRole();
  const { restaurantId } = useRestaurantContext();

  useEffect(() => {
    if (!loading && isSuperadmin) navigate("/superadmin", { replace: true });
  }, [loading, isSuperadmin, navigate]);

  const cutoff = useMemo(startOfDayIso, []);

  const { data: stats } = useQuery({
    queryKey: ["overview-stats", restaurantId, cutoff],
    enabled: !!restaurantId,
    queryFn: async () => {
      const [ordersRes, bookingsRes, debtorsRes] = await Promise.all([
        supabase.from("orders").select("id,total,status,payment_status,created_at,paid_at").eq("restaurant_id", restaurantId!).gte("created_at", cutoff),
        supabase.from("bookings").select("id").eq("restaurant_id", restaurantId!).gte("booking_time", cutoff),
        supabase.from("debtors").select("id,amount_owed,payment_status").eq("restaurant_id", restaurantId!).eq("payment_status", "unpaid"),
      ]);
      const orders = ordersRes.data ?? [];
      const paid = orders.filter((o: any) => o.payment_status === "paid" || o.paid_at);
      const revenue = paid.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
      const open = orders.filter((o: any) => o.status !== "confirmed" && o.status !== "cancelled" || o.payment_status !== "paid").length;
      const debtsCount = debtorsRes.data?.length ?? 0;
      const debtsAmount = (debtorsRes.data ?? []).reduce((s: number, d: any) => s + Number(d.amount_owed || 0), 0);
      return {
        revenue, ordersCount: orders.length, openCount: open,
        bookingsCount: bookingsRes.data?.length ?? 0,
        debtsCount, debtsAmount,
      };
    },
  });

  const { data: recentOrders } = useQuery({
    queryKey: ["overview-recent-orders", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,order_number,total,status,payment_status,customer_name,created_at")
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const { data: todayBookings } = useQuery({
    queryKey: ["overview-today-bookings", restaurantId, cutoff],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id,booking_time,table_number,guest_count,customer_name,status")
        .eq("restaurant_id", restaurantId!)
        .gte("booking_time", cutoff)
        .order("booking_time", { ascending: true })
        .limit(6);
      return data ?? [];
    },
  });

  if (loading) return <PageSkeleton />;

  if (!role) {
    return (
      <div className="max-w-xl mx-auto">
        <Card>
          <CardHeader><CardTitle>Role not assigned</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Meet administrator to be assigned to a role.
          </CardContent>
        </Card>
      </div>
    );
  }

  const accentStrips = ["bg-brand", "bg-accent2", "bg-accent3", "bg-danger", "bg-brand"];

  return (
    <div className="space-y-4">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Revenue Today"
          value={formatCurrency(stats?.revenue ?? 0)}
          change={`${stats?.ordersCount ?? 0} orders today`}
          changeKind="neutral"
          Icon={Wallet} accent="brand"
        />
        <StatCard
          label="Open Orders"
          value={String(stats?.openCount ?? 0)}
          change="Awaiting service"
          changeKind="neutral"
          Icon={ShoppingCart} accent="accent2"
        />
        <StatCard
          label="Bookings"
          value={String(stats?.bookingsCount ?? 0)}
          change="Today"
          changeKind="neutral"
          Icon={CalendarClock} accent="accent3"
        />
        <StatCard
          label="Debtors"
          value={String(stats?.debtsCount ?? 0)}
          change={`${formatCurrency(stats?.debtsAmount ?? 0)} outstanding`}
          changeKind={stats?.debtsCount ? "down" : "neutral"}
          Icon={Users} accent="danger"
        />
      </div>

      {/* 2-col row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent orders */}
        <div className="bg-bg2 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[14px] font-semibold">Recent Orders</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">Last 5 transactions</p>
            </div>
            <Link to="/orders" className="text-[12px] text-brand font-medium hover:underline">View all</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.5px] text-muted-foreground">
                  <th className="pb-2.5 font-medium">Order</th>
                  <th className="pb-2.5 font-medium">Customer</th>
                  <th className="pb-2.5 font-medium">Status</th>
                  <th className="pb-2.5 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(recentOrders ?? []).map((o: any, i: number) => (
                  <tr key={o.id} className={cn(i !== (recentOrders!.length - 1) && "border-b border-border")}>
                    <td className="py-2.5 font-mono text-[12px]">#{o.order_number || o.id.slice(0, 4).toUpperCase()}</td>
                    <td className="py-2.5 truncate max-w-[120px]">{o.customer_name || "Walk-in"}</td>
                    <td className="py-2.5">
                      <span className={cn(
                        "inline-block px-2 py-0.5 rounded text-[11px] font-medium",
                        o.payment_status === "paid"
                          ? "bg-accent2/15 text-accent2"
                          : o.status === "cancelled" ? "bg-danger/15 text-danger" : "bg-muted text-muted-foreground",
                      )}>
                        {o.payment_status === "paid" ? "Paid" : o.status === "cancelled" ? "Cancelled" : "Open"}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono font-semibold">{formatCurrency(Number(o.total || 0))}</td>
                  </tr>
                ))}
                {!recentOrders?.length && (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-[12px]">No orders yet today.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Today's bookings */}
        <div className="bg-bg2 border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[14px] font-semibold">Today's Bookings</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">Reservations for today</p>
            </div>
            <Link to="/bookings" className="text-[12px] text-brand font-medium hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {(todayBookings ?? []).map((b: any, i: number) => (
              <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-bg3/60 relative overflow-hidden">
                <span className={cn("absolute left-0 top-0 bottom-0 w-1", accentStrips[i % accentStrips.length])} />
                <div className="pl-2 font-mono text-[13px] font-semibold tabular-nums">
                  {new Date(b.booking_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">{b.customer_name || "Guest"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Table {b.table_number ?? "—"} · {b.guest_count ?? 1} guests
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-bg2 text-muted-foreground">
                  {b.status || "pending"}
                </span>
              </div>
            ))}
            {!todayBookings?.length && (
              <p className="text-center text-muted-foreground text-[12px] py-6">No bookings scheduled today.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Overview;
