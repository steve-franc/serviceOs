import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Receipt, Calendar, FileText } from "lucide-react";
import { format } from "date-fns";

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
  payment_methods: Record<string, number>;
}

const OrderHistory = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
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
      if (!user) throw new Error("User not authenticated");

      const today = new Date().toISOString().split('T')[0];
      
      // Get today's orders
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
      const totalOrders = todayOrders.length;
      const totalRevenue = todayOrders.reduce((sum, order) => sum + Number(order.total), 0);
      
      // Group by payment method
      const paymentMethods: Record<string, number> = {};
      todayOrders.forEach((order) => {
        paymentMethods[order.payment_method] = (paymentMethods[order.payment_method] || 0) + Number(order.total);
      });

      // Save report
      const { error: reportError } = await supabase
        .from("daily_reports")
        .upsert({
          staff_id: user.id,
          report_date: today,
          total_orders: totalOrders,
          total_revenue: totalRevenue,
          payment_methods: paymentMethods,
        }, {
          onConflict: 'staff_id,report_date'
        });

      if (reportError) throw reportError;

      setDailyReport({ total_orders: totalOrders, total_revenue: totalRevenue, payment_methods: paymentMethods });
      setReportDialogOpen(true);
      toast.success("Daily report generated successfully");
    } catch (error: any) {
      toast.error("Failed to generate daily report");
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
          <Button onClick={handleEndDay} disabled={generatingReport}>
            <FileText className="h-4 w-4 mr-2" />
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

        <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Daily Report</DialogTitle>
              <DialogDescription>
                Summary for {format(new Date(), "MMMM d, yyyy")}
              </DialogDescription>
            </DialogHeader>
            
            {dailyReport && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Total Orders</span>
                    <span className="font-bold text-lg">{dailyReport.total_orders}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Total Revenue</span>
                    <span className="font-bold text-2xl text-primary">
                      ${dailyReport.total_revenue.toFixed(2)}
                    </span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="font-semibold text-sm">Payment Methods</p>
                  {Object.entries(dailyReport.payment_methods).map(([method, amount]) => (
                    <div key={method} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground capitalize">{method}</span>
                      <span className="font-medium">${Number(amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <Button onClick={() => window.print()} className="w-full">
                  <Receipt className="h-4 w-4 mr-2" />
                  Print Report
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default OrderHistory;
