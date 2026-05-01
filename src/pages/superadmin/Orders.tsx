import Layout from "@/components/Layout";
import { StatusBadge } from "@/components/superadmin/StatusBadge";
import { useSuperOrders } from "@/hooks/useSuperadminData";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/currency";

function fmt(iso: string) {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function SuperOrders() {
  const { data: orders, isLoading } = useSuperOrders(500);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">All Orders</h1>
          <span className="text-sm text-muted-foreground">{orders?.length ?? 0} orders</span>
        </div>

        <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span>#</span><span>Customer</span><span>Restaurant</span><span>Amount</span><span>Payment</span><span>Status</span>
          </div>
          {isLoading ? (
            <div className="p-3 space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !orders || orders.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">No orders yet</div>
          ) : (
            orders.map((o: any, i: number) => (
              <motion.div key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.5) }}
                className="grid grid-cols-1 md:grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-1 md:gap-4 items-center px-5 py-3 border-b border-border last:border-b-0 hover:bg-accent/50 transition-colors">
                <span className="text-sm font-medium font-mono">#{o.order_number}</span>
                <div className="min-w-0">
                  <p className="text-sm truncate">{o.customer_name || (o.is_public_order ? "Online" : "Walk-in")}</p>
                  <p className="text-xs text-muted-foreground">{fmt(o.created_at)}</p>
                </div>
                <span className="hidden md:block text-sm text-muted-foreground truncate">{o.restaurant_name}</span>
                <span className="hidden md:block text-sm font-medium font-mono">{formatPrice(Number(o.total))}</span>
                <span className="hidden md:block text-xs text-muted-foreground capitalize">{o.payment_method}</span>
                <div><StatusBadge status={o.status} /></div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
