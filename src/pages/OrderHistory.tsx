import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Receipt, Calendar, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

interface Order {
  id: string;
  order_number: number;
  total: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
}

interface DailyReport {
  total_orders: number;
  total_revenue: number;
  payment_methods: Record<string, { count: number; total: number }>;
}

const OrderHistory = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error: any) {
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  const handleEndDay = async () => {
    setGeneratingReport(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get today's date
      const today = format(new Date(), "yyyy-MM-dd");

      // Fetch today's orders
      const { data: todayOrders, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`)
        .eq("staff_id", user.id);

      if (ordersError) throw ordersError;

      if (!todayOrders || todayOrders.length === 0) {
        toast.error("No orders found for today");
        setGeneratingReport(false);
        return;
      }

      // Calculate totals
      const totalRevenue = todayOrders.reduce((sum, order) => sum + Number(order.total), 0);
      const paymentMethods: Record<string, { count: number; total: number }> = {};

      todayOrders.forEach((order) => {
        if (!paymentMethods[order.payment_method]) {
          paymentMethods[order.payment_method] = { count: 0, total: 0 };
        }
        paymentMethods[order.payment_method].count++;
        paymentMethods[order.payment_method].total += Number(order.total);
      });

      // Save daily report
      const { error: reportError } = await supabase
        .from("daily_reports")
        .upsert({
          staff_id: user.id,
          report_date: today,
          total_orders: todayOrders.length,
          total_revenue: totalRevenue,
          payment_methods: paymentMethods,
        });

      if (reportError) throw reportError;

      // Set report data and show dialog
      setDailyReport({
        total_orders: todayOrders.length,
        total_revenue: totalRevenue,
        payment_methods: paymentMethods,
      });
      setShowReport(true);

      toast.success("Daily report generated successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate report");
    } finally {
      setGeneratingReport(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Order History</h2>
            <p className="text-muted-foreground">View and reprint past orders</p>
          </div>
          <Button
            onClick={handleEndDay}
            disabled={generatingReport}
            size="lg"
            className="gap-2"
          >
            <TrendingUp className="h-4 w-4" />
            {generatingReport ? "Generating..." : "End Day"}
          </Button>
        </div>

        {loading && <p className="text-center text-muted-foreground">Loading orders...</p>}

        {!loading && orders.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">No orders yet</p>
              <Button onClick={() => navigate("/order/create")}>Create First Order</Button>
            </CardContent>
          </Card>
        )}

        {!loading && orders.length > 0 && (
          <div className="space-y-4">
            {orders.map((order) => (
              <Card
                key={order.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/receipt/${order.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-xl flex items-center gap-2">
                        Order #{order.order_number}
                        <Badge variant="outline" className="font-normal">
                          {order.payment_method}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(order.created_at), "PPp")}
                      </CardDescription>
                      {order.notes && (
                        <CardDescription className="text-sm mt-2">
                          Note: {order.notes}
                        </CardDescription>
                      )}
                    </div>
                    <div className="text-right space-y-2">
                      <p className="text-2xl font-bold text-primary">
                        ${order.total.toFixed(2)}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/receipt/${order.id}`);
                        }}
                      >
                        <Receipt className="h-4 w-4 mr-1" />
                        View Receipt
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Daily Report</DialogTitle>
            <DialogDescription>
              Summary for {format(new Date(), "PPP")}
            </DialogDescription>
          </DialogHeader>

          {dailyReport && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Total Orders</CardDescription>
                    <CardTitle className="text-3xl text-primary">
                      {dailyReport.total_orders}
                    </CardTitle>
                  </CardHeader>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Total Revenue</CardDescription>
                    <CardTitle className="text-3xl text-primary">
                      ${dailyReport.total_revenue.toFixed(2)}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-4">Payment Methods Breakdown</h3>
                <div className="space-y-3">
                  {Object.entries(dailyReport.payment_methods).map(([method, data]) => (
                    <div
                      key={method}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{method}</p>
                        <p className="text-sm text-muted-foreground">
                          {data.count} {data.count === 1 ? "order" : "orders"}
                        </p>
                      </div>
                      <p className="text-lg font-bold text-primary">
                        ${data.total.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => window.print()}
                >
                  <Receipt className="h-4 w-4 mr-2" />
                  Print Report
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowReport(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default OrderHistory;
