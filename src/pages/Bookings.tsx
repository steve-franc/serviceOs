import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isFuture, isPast, startOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, Phone, User, CheckCircle2, XCircle, Ban, Receipt } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface Booking {
  id: string;
  order_id: string;
  menu_item_id: string;
  start_at: string;
  end_at: string;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  menu_items?: { name: string } | null;
  orders?: { order_number: string; payment_status: string; total: number } | null;
}

const STATUS_STYLES: Record<string, string> = {
  booked: "bg-primary/10 text-primary border-primary/20",
  completed: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  no_show: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export default function Bookings() {
  const { restaurantId } = useRestaurantContext();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"today" | "upcoming" | "past">("today");

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["service-bookings", restaurantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("service_bookings")
        .select(
          "id, order_id, menu_item_id, start_at, end_at, status, customer_name, customer_phone, menu_items(name), orders(order_number, payment_status, total)"
        )
        .eq("restaurant_id", restaurantId!)
        .order("start_at", { ascending: true });
      if (error) throw error;
      return (data as Booking[]) || [];
    },
    enabled: !!restaurantId,
  });

  const filtered = useMemo(() => {
    const now = new Date();
    if (tab === "today") return bookings.filter((b) => isToday(new Date(b.start_at)));
    if (tab === "upcoming")
      return bookings.filter(
        (b) => isFuture(new Date(b.start_at)) && !isToday(new Date(b.start_at))
      );
    return bookings.filter(
      (b) => isPast(new Date(b.start_at)) && !isToday(new Date(b.start_at))
    );
  }, [bookings, tab]);

  // Group filtered by date string
  const grouped = useMemo(() => {
    const map = new Map<string, Booking[]>();
    filtered.forEach((b) => {
      const key = format(startOfDay(new Date(b.start_at)), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    });
    return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
  }, [filtered]);

  const updateStatus = async (id: string, next: string) => {
    if (next === "cancelled") {
      const { error } = await (supabase as any).rpc("cancel_service_booking", {
        _booking_id: id,
      });
      if (error) {
        toast.error(error.message || "Failed to cancel");
        return;
      }
    } else {
      const { error } = await (supabase as any)
        .from("service_bookings")
        .update({ status: next })
        .eq("id", id);
      if (error) {
        toast.error(error.message || "Failed to update");
        return;
      }
    }
    toast.success("Booking updated");
    qc.invalidateQueries({ queryKey: ["service-bookings", restaurantId] });
  };

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <CalendarClock className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Bookings</h1>
            <p className="text-muted-foreground text-sm">Upcoming and past customer service appointments</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="today">
              Today
              <Badge variant="secondary" className="ml-2">
                {bookings.filter((b) => isToday(new Date(b.start_at))).length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-6 space-y-6">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : grouped.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  No bookings here yet.
                </CardContent>
              </Card>
            ) : (
              grouped.map(({ date, items }) => (
                <div key={date} className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {format(new Date(date), "EEEE, do MMMM yyyy")}
                  </h2>
                  <div className="space-y-2">
                    {items.map((b) => (
                      <Card key={b.id} className="hover:shadow-sm transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-primary">
                                  {format(new Date(b.start_at), "HH:mm")}
                                </span>
                                <span>·</span>
                                <span>{b.menu_items?.name || "Service"}</span>
                                <Badge variant="outline" className={STATUS_STYLES[b.status] || ""}>
                                  {b.status.replace("_", " ")}
                                </Badge>
                              </CardTitle>
                              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                                {b.customer_name && (
                                  <span className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {b.customer_name}
                                  </span>
                                )}
                                {b.customer_phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {b.customer_phone}
                                  </span>
                                )}
                                {b.orders && (
                                  <span>Order #{b.orders.order_number}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        {b.status === "booked" && (
                          <CardContent className="pt-0 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatus(b.id, "completed")}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                              Mark completed
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatus(b.id, "no_show")}
                            >
                              <XCircle className="h-3.5 w-3.5 mr-1.5" />
                              No-show
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive"
                              onClick={() => updateStatus(b.id, "cancelled")}
                            >
                              <Ban className="h-3.5 w-3.5 mr-1.5" />
                              Cancel
                            </Button>
                          </CardContent>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
