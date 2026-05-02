import { Link, useParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { useSuperMenu, useSuperRestaurantDetail } from "@/hooks/useSuperadminData";
import { ArrowLeft, Eye, EyeOff, Clock, Package, CalendarClock } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";

export default function SuperRestaurantMenu() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useSuperMenu(id);
  const { data: detail } = useSuperRestaurantDetail(id);

  const grouped = useMemo(() => {
    const items: any[] = data?.items ?? [];
    const map = new Map<string, any[]>();
    for (const it of items) {
      const k = it.category || "Uncategorized";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    }
    return Array.from(map.entries());
  }, [data]);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div>
          <Link to={`/superadmin/restaurants/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Business
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{detail?.restaurant?.name || "Menu"}</h1>
          <p className="text-sm text-muted-foreground">{data?.items?.length ?? 0} menu items</p>
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : grouped.length === 0 ? (
          <div className="rounded-xl bg-card border border-border p-12 text-center text-sm text-muted-foreground">No menu items yet</div>
        ) : (
          grouped.map(([cat, items]) => (
            <motion.div key={cat} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-muted/30">
                <h2 className="text-sm font-semibold">{cat}</h2>
              </div>
              <div className="divide-y divide-border">
                {items.map((it: any) => (
                  <div key={it.id} className="px-5 py-3 flex items-start gap-4">
                    {it.image_url && (
                      <img src={it.image_url} alt={it.name} className="h-12 w-12 rounded-md object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{it.name}</p>
                        {!it.is_available && <Badge variant="outline" className="text-destructive border-destructive/40">Out of stock</Badge>}
                        {it.is_public ? (
                          <Badge variant="outline" className="gap-1 text-xs"><Eye className="h-3 w-3" /> Public</Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-xs text-muted-foreground"><EyeOff className="h-3 w-3" /> Internal</Badge>
                        )}
                        {it.is_service ? (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <CalendarClock className="h-3 w-3" /> Service · {it.service_duration_minutes}m · {it.slot_capacity} slot{it.slot_capacity > 1 ? "s" : ""}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Package className="h-3 w-3" /> Stock: {it.stock_qty}
                          </Badge>
                        )}
                      </div>
                      {it.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{it.description}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium font-mono">{formatPrice(Number(it.base_price))}</p>
                      {it.per_unit_price != null && (
                        <p className="text-[11px] text-muted-foreground font-mono">+{formatPrice(Number(it.per_unit_price))} {it.pricing_unit || ""}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </Layout>
  );
}
