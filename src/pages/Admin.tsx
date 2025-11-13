import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield, Users, ShoppingBag, TrendingUp, Calendar } from "lucide-react";
import { format, subDays } from "date-fns";
import { formatPrice } from "@/lib/currency";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "react-router-dom";
interface StaffMember {
  id: string;
  email: string;
  full_name: string;
  role: string;
}
interface Order {
  id: string;
  order_number: number;
  total: number;
  payment_method: string;
  created_at: string;
  staff_id: string;
  currency: string;
  profiles: {
    full_name: string;
  };
}
interface DailyReport {
  id: string;
  report_date: string;
  total_orders: number;
  total_revenue: number;
  payment_methods: Record<string, {
    count: number;
    total: number;
  }>;
  profiles: {
    full_name: string;
  };
  currency?: string;
}
const Admin = () => {
  const {
    isAdmin,
    loading: roleLoading
  } = useUserRole();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState("7");
  useEffect(() => {
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin, dateFilter]);
  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchStaff(), fetchOrders(), fetchReports()]);
    } catch (error) {
      toast.error("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };
  const fetchStaff = async () => {
    const {
      data: profiles
    } = await supabase.from("profiles").select(`
        id,
        full_name
      `);
    const {
      data: roles
    } = await supabase.from("user_roles").select("user_id, role");
    const staffMembers = profiles?.map(profile => {
      const userRole = roles?.find(r => r.user_id === profile.id);
      return {
        id: profile.id,
        email: "",
        // Email not accessible from client side for security
        full_name: profile.full_name,
        role: userRole?.role || "staff"
      };
    }) || [];
    setStaff(staffMembers);
  };
  const fetchOrders = async () => {
    const startDate = subDays(new Date(), parseInt(dateFilter));
    const {
      data
    } = await supabase.from("orders").select(`
        *,
        profiles!orders_staff_id_fkey(full_name)
      `).gte("created_at", startDate.toISOString()).order("created_at", {
      ascending: false
    });
    setOrders(data as any || []);
  };
  const fetchReports = async () => {
    const startDate = subDays(new Date(), parseInt(dateFilter));
    const {
      data: reportsData
    } = await supabase.from("daily_reports").select(`
        *,
        profiles!daily_reports_staff_id_fkey(full_name)
      `).gte("report_date", format(startDate, "yyyy-MM-dd")).order("report_date", {
      ascending: false
    });

    // Fetch the first order from each report date to get currency
    const reportsWithCurrency = await Promise.all((reportsData || []).map(async report => {
      const {
        data: firstOrder
      } = await supabase.from("orders").select("currency").gte("created_at", report.report_date).lt("created_at", format(new Date(new Date(report.report_date).getTime() + 86400000), "yyyy-MM-dd")).limit(1).maybeSingle();
      return {
        ...report,
        currency: firstOrder?.currency || 'USD'
      };
    }));
    setReports(reportsWithCurrency as any);
  };
  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      // Remove existing roles
      await supabase.from("user_roles").delete().eq("user_id", userId);

      // Add new role
      const {
        error
      } = await supabase.from("user_roles").insert([{
        user_id: userId,
        role: newRole as "admin" | "staff"
      }]);
      if (error) throw error;
      toast.success("Role updated successfully");
      fetchStaff();
    } catch (error) {
      toast.error("Failed to update role");
    }
  };
  if (roleLoading) {
    return <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </Layout>;
  }
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total), 0);
  return <Layout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-3xl font-bold">Admin Dashboard</h2>
            <p className="text-muted-foreground">Manage staff, orders, and reports</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">Total Users



              <Users className="h-4 w-4" />
                Total Staff
              </CardDescription>
              <CardTitle className="text-3xl">{staff.length}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                Total Orders
              </CardDescription>
              <CardTitle className="text-3xl">{orders.length}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Total Revenue
              </CardDescription>
              <CardTitle className="text-3xl">
                {orders.length > 0 ? formatPrice(totalRevenue, orders[0]?.currency || 'USD') : '$0.00'}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs defaultValue="staff" className="space-y-4">
          <TabsList>
            <TabsTrigger value="staff">Staff Management</TabsTrigger>
            <TabsTrigger value="orders">All Orders</TabsTrigger>
            <TabsTrigger value="reports">Daily Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="staff" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Users</CardTitle>
                <CardDescription>Manage staff roles and permissions</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? <p className="text-center text-muted-foreground">Loading...</p> : <div className="space-y-3">
                    {staff.map(member => <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium">{member.full_name}</p>
                          <p className="text-xs text-muted-foreground">ID: {member.id.substring(0, 8)}...</p>
                        </div>
                        <Select value={member.role} onValueChange={value => handleRoleChange(member.id, value)}>
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="staff">Staff</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>)}
                  </div>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">All Orders</h3>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 24 hours</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? <p className="text-center text-muted-foreground">Loading...</p> : <div className="space-y-3">
                {orders.map(order => <Card key={order.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">Order #{order.order_number}</p>
                            <Badge variant="outline">{order.payment_method}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Staff: {order.profiles?.full_name || "Public Order"}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(order.created_at), "PPp")}
                          </p>
                        </div>
                        <p className="text-2xl font-bold text-primary">
                          {formatPrice(order.total, order.currency)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>)}
              </div>}
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Daily Reports</h3>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? <p className="text-center text-muted-foreground">Loading...</p> : <div className="space-y-3">
                {reports.map(report => <Card key={report.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {format(new Date(report.report_date), "PPP")}
                          </CardTitle>
                          <CardDescription>
                            Staff: {report.profiles?.full_name || "Unknown"}
                          </CardDescription>
                        </div>
                        <Badge variant="outline" className="text-lg px-4 py-2">
                          {formatPrice(report.total_revenue, report.currency || 'USD')}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Orders</p>
                          <p className="text-2xl font-bold">{report.total_orders}</p>
                        </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Payment Methods</p>
                            <div className="mt-1 space-y-1">
                              {Object.entries(report.payment_methods).map(([method, data]) => <p key={method} className="text-sm">
                                  {method}: {data.count} ({formatPrice(data.total, report.currency || 'USD')})
                                </p>)}
                            </div>
                          </div>
                      </div>
                    </CardContent>
                  </Card>)}
              </div>}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>;
};
export default Admin;