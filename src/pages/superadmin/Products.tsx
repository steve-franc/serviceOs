import Layout from "@/components/Layout";
import { useSuperTopProducts } from "@/hooks/useSuperadminData";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/currency";

export default function SuperProducts() {
  const { data: products, isLoading } = useSuperTopProducts(100);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Top Products</h1>
            <p className="text-sm text-muted-foreground">Best sellers across all restaurants</p>
          </div>
          <span className="text-sm text-muted-foreground">{products?.length ?? 0} items</span>
        </div>

        <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[auto_1fr_auto_auto] gap-4 px-5 py-3 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span>#</span><span>Product</span><span>Sold</span><span>Revenue</span>
          </div>
          {isLoading ? (
            <div className="p-3 space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !products || products.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">No sales data yet</div>
          ) : (
            products.map((p: any, i: number) => (
              <motion.div key={p.menu_item_name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.5) }}
                className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto_auto] gap-1 md:gap-4 items-center px-5 py-4 border-b border-border last:border-b-0 hover:bg-accent/50 transition-colors">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">{i + 1}</span>
                <p className="text-sm font-medium">{p.menu_item_name}</p>
                <span className="text-sm text-muted-foreground md:text-right">{p.total_sold} sold</span>
                <span className="text-sm font-medium font-mono md:text-right">{formatPrice(Number(p.revenue))}</span>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
