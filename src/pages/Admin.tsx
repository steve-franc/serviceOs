import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Shield, Users, ShoppingBag, TrendingUp, Calendar, AlertCircle, UserMinus, Target, Save, Link2, Copy, Check, Tag, Plus, X, Settings, MessageCircle } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { formatPrice } from "@/lib/currency";
import { dailyShareOfMonthly, daysInMonth } from "@/lib/date-format";
import { sumPaidRevenue, sumUnpaidRevenue, dailyBillsTarget } from "@/lib/revenue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate, useNavigate } from "react-router-dom";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { useMenuTags, useInvalidateMenuTags, useMenuItems } from "@/hooks/useQueries";
import { PaymentMethodConfig, parsePaymentMethods } from "@/lib/payment-methods";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
interface StaffMember {
  id: string;
  email: string;
  full_name: string;
  role: string;
}
interface Order {
  id: string;
  order_number: string;
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
  const navigate = useNavigate();
  const {
    isManager,
    isInvestor,
    canViewReports,
    loading: roleLoading
  } = useUserRole();
  const readOnly = !isManager; // investors view but cannot edit
  const { restaurantId, loading: restaurantLoading } = useRestaurantContext();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [todayOrders, setTodayOrders] = useState<Order[]>([]);
  const [todayExpenses, setTodayExpenses] = useState<{ amount: number; created_at: string }[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState("7");
  const [fixedDailyBills, setFixedDailyBills] = useState<number>(0);
  const [editingBills, setEditingBills] = useState(false);
  const [billsInput, setBillsInput] = useState("");
  const [fixedMonthlyExpenses, setFixedMonthlyExpenses] = useState<number>(0);
  const [editingMonthly, setEditingMonthly] = useState(false);
  const [monthlyInput, setMonthlyInput] = useState("");
  const [monthlyBills, setMonthlyBills] = useState<{ name: string; amount: number }[]>([]);
  const [billsDialogOpen, setBillsDialogOpen] = useState(false);
  const [editBills, setEditBills] = useState<{ name: string; amount: number }[]>([]);
  const [profitMarginThreshold, setProfitMarginThreshold] = useState<number>(20);
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [thresholdInput, setThresholdInput] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagCategory, setNewTagCategory] = useState("");
  const [configuredPaymentMethods, setConfiguredPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [newPaymentMethod, setNewPaymentMethod] = useState("");
  const [editingMethod, setEditingMethod] = useState<PaymentMethodConfig | null>(null);
  const [editCurrency, setEditCurrency] = useState("");
  const [editAccount, setEditAccount] = useState("");
  const [editRate, setEditRate] = useState("");
  const [allowPublicOrders, setAllowPublicOrders] = useState<boolean>(true);
  const [savingPublicOrders, setSavingPublicOrders] = useState(false);
  const { data: menuTags = [], isLoading: tagsLoading } = useMenuTags();
  const invalidateTags = useInvalidateMenuTags();
  const { data: menuItemsData = [] } = useMenuItems();

  // Get unique categories from menu items
  const categories = useMemo(() => {
    const cats = new Set<string>();
    (menuItemsData as any[]).forEach(item => {
      if (item.category) cats.add(item.category);
    });
    return Array.from(cats).sort();
  }, [menuItemsData]);

  // Group tags by name
  const groupedTags = useMemo(() => {
    const groups: Record<string, { categories: { id: string; category: string }[] }> = {};
    (menuTags as any[]).forEach(tag => {
      if (!groups[tag.name]) groups[tag.name] = { categories: [] };
      if (tag.category) groups[tag.name].categories.push({ id: tag.id, category: tag.category });
    });
    return groups;
  }, [menuTags]);

  // Get unique tag names for the dropdown
  const tagNames = useMemo(() => Object.keys(groupedTags).sort(), [groupedTags]);
  useEffect(() => {
    if (canViewReports && restaurantId) {
      fetchData();
      fetchFixedDailyBills();
    }
  }, [canViewReports, restaurantId, dateFilter]);
  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchStaff(), fetchOrders(), fetchTodayOrders(), fetchTodayExpenses(), fetchReports()]);
    } catch (error) {
      toast.error("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  const fetchFixedDailyBills = async () => {
    if (!restaurantId) return;
    const { data } = await supabase
      .from("restaurant_settings")
      .select("fixed_daily_bills, payment_methods, fixed_monthly_expenses, profit_margin_threshold, monthly_bills, allow_public_orders")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (data) {
      setFixedDailyBills(Number(data.fixed_daily_bills) || 0);
      setBillsInput(String(data.fixed_daily_bills || 0));
      setConfiguredPaymentMethods(parsePaymentMethods(data.payment_methods));
      setFixedMonthlyExpenses(Number((data as any).fixed_monthly_expenses) || 0);
      setMonthlyInput(String((data as any).fixed_monthly_expenses || 0));
      const bills = (data as any).monthly_bills;
      setMonthlyBills(Array.isArray(bills) ? bills : []);
      setProfitMarginThreshold(Number((data as any).profit_margin_threshold) || 20);
      setThresholdInput(String((data as any).profit_margin_threshold || 20));
      setAllowPublicOrders(Boolean((data as any).allow_public_orders ?? true));
    }
  };

  const togglePublicOrders = async (next: boolean) => {
    if (!restaurantId) return;
    setSavingPublicOrders(true);
    const previous = allowPublicOrders;
    setAllowPublicOrders(next);
    const { error } = await supabase
      .from("restaurant_settings")
      .update({ allow_public_orders: next })
      .eq("restaurant_id", restaurantId);
    setSavingPublicOrders(false);
    if (error) {
      setAllowPublicOrders(previous);
      toast.error("Failed to update public orders setting");
      return;
    }
    toast.success(next ? "Public ordering enabled" : "Public ordering disabled");
  };

  const saveMonthlyBills = async (bills: { name: string; amount: number }[]) => {
    if (!restaurantId) return;
    const total = bills.reduce((s, b) => s + b.amount, 0);
    const { error } = await supabase
      .from("restaurant_settings")
      .update({ fixed_monthly_expenses: total, monthly_bills: bills } as any)
      .eq("restaurant_id", restaurantId);
    if (error) { toast.error("Failed to save"); return; }
    setMonthlyBills(bills);
    setFixedMonthlyExpenses(total);
    setMonthlyInput(String(total));
    setBillsDialogOpen(false);
    toast.success("Monthly bills updated");
  };

  const saveFixedMonthlyExpenses = async () => {
    if (!restaurantId) return;
    const value = parseFloat(monthlyInput) || 0;
    const { error } = await supabase
      .from("restaurant_settings")
      .update({ fixed_monthly_expenses: value } as any)
      .eq("restaurant_id", restaurantId);
    if (error) { toast.error("Failed to save"); return; }
    setFixedMonthlyExpenses(value);
    setEditingMonthly(false);
    toast.success("Monthly fixed expenses updated");
  };

  const saveProfitThreshold = async () => {
    if (!restaurantId) return;
    const value = parseFloat(thresholdInput) || 20;
    const { error } = await supabase
      .from("restaurant_settings")
      .update({ profit_margin_threshold: value } as any)
      .eq("restaurant_id", restaurantId);
    if (error) { toast.error("Failed to save"); return; }
    setProfitMarginThreshold(value);
    setEditingThreshold(false);
    toast.success("Profit margin threshold updated");
  };

  const savePaymentMethods = async (updated: PaymentMethodConfig[]) => {
    if (!restaurantId) return false;
    const { error } = await supabase
      .from("restaurant_settings")
      .update({ payment_methods: updated as any })
      .eq("restaurant_id", restaurantId);
    if (error) { toast.error("Failed to save payment methods"); return false; }
    setConfiguredPaymentMethods(updated);
    return true;
  };

  const addPaymentMethod = async () => {
    const method = newPaymentMethod.trim();
    if (!method || !restaurantId) return;
    if (configuredPaymentMethods.some(m => m.name === method)) {
      toast.error("Payment method already exists");
      return;
    }
    const newConfig: PaymentMethodConfig = { name: method, currency: "TRY", account_number: "", conversion_rate: 1 };
    const updated = [...configuredPaymentMethods, newConfig];
    if (await savePaymentMethods(updated)) {
      setNewPaymentMethod("");
      toast.success(`Added "${method}"`);
    }
  };

  const removePaymentMethod = async (methodName: string) => {
    if (!restaurantId) return;
    const updated = configuredPaymentMethods.filter(m => m.name !== methodName);
    if (updated.length === 0) {
      toast.error("Must have at least one payment method");
      return;
    }
    if (await savePaymentMethods(updated)) {
      toast.success(`Removed "${methodName}"`);
    }
  };

  const openEditMethod = (method: PaymentMethodConfig) => {
    setEditingMethod(method);
    setEditCurrency(method.currency);
    setEditAccount(method.account_number);
    setEditRate(String(method.conversion_rate));
  };

  const saveEditMethod = async () => {
    if (!editingMethod) return;
    const updated = configuredPaymentMethods.map(m =>
      m.name === editingMethod.name
        ? { ...m, currency: editCurrency.trim() || "TRY", account_number: editAccount.trim(), conversion_rate: parseFloat(editRate) || 1 }
        : m
    );
    if (await savePaymentMethods(updated)) {
      toast.success(`Updated "${editingMethod.name}"`);
      setEditingMethod(null);
    }
  };

  const saveFixedDailyBills = async () => {
    if (!restaurantId) return;
    const value = parseFloat(billsInput) || 0;
    const { error } = await supabase
      .from("restaurant_settings")
      .update({ fixed_daily_bills: value })
      .eq("restaurant_id", restaurantId);
    if (error) {
      toast.error("Failed to save daily bills");
      return;
    }
    setFixedDailyBills(value);
    setEditingBills(false);
    toast.success("Daily bills target updated");
  };

  const fetchTodayOrders = async () => {
    if (!restaurantId) return;
    
    // Get the latest daily report to use as cutoff (same logic as OrderHistory)
    const { data: latestReport } = await supabase
      .from("daily_reports")
      .select("created_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    // Build query for orders since last "End Day"
    let query = supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurantId);
    
    if (latestReport?.created_at) {
      query = query.gt("created_at", latestReport.created_at);
    }
    
    const { data: ordersData } = await query;
    
    if (!ordersData || ordersData.length === 0) {
      setTodayOrders([]);
      return;
    }

    // Fetch profiles separately
    const staffIds = [...new Set(ordersData.map(o => o.staff_id))];
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", staffIds);

    const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
    
    const ordersWithProfiles = ordersData.map(order => ({
      ...order,
      profiles: profilesMap.get(order.staff_id) || { full_name: "Unknown" }
    }));
    
    setTodayOrders(ordersWithProfiles as any);
  };
  const fetchStaff = async () => {
    if (!restaurantId) {
      setStaff([]);
      return;
    }

    const { data: memberships, error: membershipsError } = await supabase
      .from("restaurant_memberships")
      .select("user_id")
      .eq("restaurant_id", restaurantId);
    if (membershipsError) throw membershipsError;

    const userIds = (memberships || []).map(m => m.user_id);
    if (userIds.length === 0) {
      setStaff([]);
      return;
    }

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    if (profilesError) throw profilesError;

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("restaurant_id", restaurantId);
    if (rolesError) throw rolesError;

    const staffMembers: StaffMember[] = (profiles || []).map(profile => {
      const userRole = roles?.find(r => r.user_id === profile.id);
      return {
        id: profile.id,
        email: "",
        full_name: profile.full_name,
        role: userRole?.role || "",
      };
    });

    setStaff(staffMembers);
  };
  const fetchOrders = async () => {
    if (!restaurantId) return;
    
    const startDate = subDays(new Date(), parseInt(dateFilter));
    const { data: ordersData } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: false });
    
    if (!ordersData || ordersData.length === 0) {
      setOrders([]);
      return;
    }

    // Fetch profiles separately
    const staffIds = [...new Set(ordersData.map(o => o.staff_id))];
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", staffIds);

    const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
    
    const ordersWithProfiles = ordersData.map(order => ({
      ...order,
      profiles: profilesMap.get(order.staff_id) || { full_name: "Unknown" }
    }));
    
    setOrders(ordersWithProfiles as any);
  };
  const fetchReports = async () => {
    if (!restaurantId) return;
    
    const startDate = subDays(new Date(), parseInt(dateFilter));
    const { data: reportsData } = await supabase
      .from("daily_reports")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .gte("report_date", format(startDate, "yyyy-MM-dd"))
      .order("report_date", { ascending: false });

    if (!reportsData || reportsData.length === 0) {
      setReports([]);
      return;
    }

    // Fetch profiles separately
    const staffIds = [...new Set(reportsData.map(r => r.staff_id))];
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", staffIds);

    const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);

    // Fetch the first order from each report date to get currency
    const reportsWithCurrency = await Promise.all(reportsData.map(async report => {
      const { data: firstOrder } = await supabase
        .from("orders")
        .select("currency")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", report.report_date)
        .lt("created_at", format(new Date(new Date(report.report_date).getTime() + 86400000), "yyyy-MM-dd"))
        .limit(1)
        .maybeSingle();
      return {
        ...report,
        profiles: profilesMap.get(report.staff_id) || { full_name: "Unknown" },
        currency: firstOrder?.currency || 'TRY'
      };
    }));
    setReports(reportsWithCurrency as any);
  };
  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      if (!restaurantId) throw new Error("Restaurant not selected");

      // Remove existing role(s) for this restaurant
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("restaurant_id", restaurantId);

      // Add new role for this restaurant
      const { error } = await supabase.from("user_roles").insert([
        {
          user_id: userId,
          role: newRole as "server" | "ops" | "counter" | "manager" | "investor",
          restaurant_id: restaurantId,
        },
      ]);
      if (error) throw error;
      toast.success("Role updated successfully");
      fetchStaff();
    } catch (error) {
      toast.error("Failed to update role");
    }
  };

  const handleRemoveStaff = async (userId: string, userName: string) => {
    try {
      if (!restaurantId) throw new Error("Restaurant not selected");

      // Remove user's role for this restaurant
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("restaurant_id", restaurantId);

      // Remove user's membership from this restaurant
      const { error } = await supabase
        .from("restaurant_memberships")
        .delete()
        .eq("user_id", userId)
        .eq("restaurant_id", restaurantId);

      if (error) throw error;
      toast.success(`${userName} has been removed from the restaurant`);
      fetchStaff();
    } catch (error) {
      toast.error("Failed to remove staff member");
    }
  };
  if (roleLoading || restaurantLoading) {
    return <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </Layout>;
  }
  if (!canViewReports) {
    return <Navigate to="/" replace />;
  }
  const todayRevenue = todayOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const pendingStaff = staff.filter(s => !s.role);
  return <Layout>
      <div className="max-w-7xl mx-auto space-y-6">
        {pendingStaff.length > 0 && (
          <Card className="border-yellow-500/50 bg-yellow-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-yellow-700">
                <AlertCircle className="h-5 w-5" />
                {pendingStaff.length} staff {pendingStaff.length === 1 ? 'member needs' : 'members need'} a role assigned
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Go to the Staff Management tab to assign roles.
            </CardContent>
          </Card>
        )}

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
              <CardDescription className="flex items-center gap-2">
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
                Today's Orders
              </CardDescription>
              <CardTitle className="text-3xl">{todayOrders.length}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Today's Revenue
              </CardDescription>
              <CardTitle className="text-3xl">
                {todayOrders.length > 0 ? formatPrice(todayRevenue, todayOrders[0]?.currency) : '₺0.00'}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Daily Bills Progress — auto-calculated from monthly bills / 30 */}
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Daily Bills Target</CardTitle>
              </div>
            </div>
            <CardDescription>
              {fixedMonthlyExpenses > 0
                ? `Auto-calculated: ${formatPrice(fixedMonthlyExpenses, 'TRY')} ÷ 30 = ${formatPrice(fixedMonthlyExpenses / 30, 'TRY')}/day`
                : "Add monthly bills below to auto-calculate your daily target (monthly ÷ 30)."}
            </CardDescription>
          </CardHeader>
          {fixedMonthlyExpenses > 0 && (() => {
            const dailyTarget = fixedMonthlyExpenses / 30;
            return (
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Revenue vs Daily Bills</span>
                  <span className="font-medium">
                    {formatPrice(todayRevenue, todayOrders[0]?.currency || 'TRY')} / {formatPrice(dailyTarget, todayOrders[0]?.currency || 'TRY')}
                  </span>
                </div>
                <Progress value={Math.min(100, (todayRevenue / dailyTarget) * 100)} className="h-4" />
                <p className={`text-sm font-medium ${todayRevenue >= dailyTarget ? "text-green-600" : "text-amber-600"}`}>
                  {todayRevenue >= dailyTarget
                    ? `✓ Bills covered! ${formatPrice(todayRevenue - dailyTarget, todayOrders[0]?.currency || 'TRY')} profit`
                    : `${formatPrice(dailyTarget - todayRevenue, todayOrders[0]?.currency || 'TRY')} more needed`}
                </p>
              </CardContent>
            );
          })()}
        </Card>

        {/* Fixed Monthly Expenses */}
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Fixed Monthly Expenses</CardTitle>
              </div>
              {!readOnly && (
                <Button variant="outline" size="sm" onClick={() => {
                  setEditBills(monthlyBills.length > 0 ? [...monthlyBills] : [{ name: "", amount: 0 }]);
                  setBillsDialogOpen(true);
                }}>
                  {monthlyBills.length > 0 ? "Edit Bills" : "Add Bills"}
                </Button>
              )}
            </div>
            <CardDescription>
              {fixedMonthlyExpenses > 0
                ? `₺${fixedMonthlyExpenses.toFixed(2)}/month → ₺${dailyShareOfMonthly(fixedMonthlyExpenses).toFixed(2)}/day (÷ ${daysInMonth()} days this month) deducted from daily profit`
                : "Add your monthly fixed costs (rent, salaries, etc.) to deduct daily from profits"}
            </CardDescription>
          </CardHeader>
          {monthlyBills.length > 0 && (
            <CardContent>
              <div className="space-y-1">
                {monthlyBills.map((bill, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{bill.name}</span>
                    <span className="font-medium">₺{bill.amount.toFixed(2)}</span>
                  </div>
                ))}
                <Separator className="my-2" />
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span>₺{fixedMonthlyExpenses.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Monthly Bills Dialog */}
        <Dialog open={billsDialogOpen} onOpenChange={setBillsDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Monthly Fixed Bills</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-auto">
              {editBills.map((bill, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Bill name (e.g. Rent)"
                    value={bill.name}
                    onChange={(e) => {
                      const next = [...editBills];
                      next[i] = { ...next[i], name: e.target.value };
                      setEditBills(next);
                    }}
                    className="flex-1"
                    maxLength={100}
                  />
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={bill.amount || ""}
                    onChange={(e) => {
                      const next = [...editBills];
                      next[i] = { ...next[i], amount: parseFloat(e.target.value) || 0 };
                      setEditBills(next);
                    }}
                    className="w-28"
                    min={0}
                    step="0.01"
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 hover:text-destructive" onClick={() => {
                    setEditBills(editBills.filter((_, idx) => idx !== i));
                  }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full" onClick={() => setEditBills([...editBills, { name: "", amount: 0 }])}>
                <Plus className="h-4 w-4 mr-1" /> Add Bill
              </Button>
              <Separator />
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span>₺{editBills.reduce((s, b) => s + b.amount, 0).toFixed(2)}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBillsDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => {
                const valid = editBills.filter(b => b.name.trim() && b.amount > 0);
                saveMonthlyBills(valid);
              }}>Save Bills</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Profit Margin Threshold */}
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Low Profit Alert Threshold</CardTitle>
              </div>
              {!readOnly && !editingThreshold && (
                <Button variant="outline" size="sm" onClick={() => { setEditingThreshold(true); setThresholdInput(String(profitMarginThreshold)); }}>
                  Edit
                </Button>
              )}
              {!readOnly && editingThreshold && (
                <div className="flex items-center gap-2">
                  <Input type="number" value={thresholdInput} onChange={(e) => setThresholdInput(e.target.value)} className="w-20 h-8" min={0} max={100} step="1" />
                  <span className="text-sm">%</span>
                  <Button size="sm" onClick={saveProfitThreshold}><Save className="h-3 w-3 mr-1" />Save</Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingThreshold(false)}>Cancel</Button>
                </div>
              )}
            </div>
            <CardDescription>
              Alert when daily profit margin drops below {profitMarginThreshold}%
            </CardDescription>
          </CardHeader>
        </Card>


        {restaurantId && (
          <Card className="border-accent/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-accent-foreground" />
                <CardTitle className="text-lg">Public Ordering Link</CardTitle>
              </div>
              <CardDescription>
                Share this link with customers so they can order directly from your menu — no sign-in required.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5 pr-3">
                  <Label className="text-sm font-medium">Accept public orders</Label>
                  <p className="text-xs text-muted-foreground">
                    {allowPublicOrders
                      ? "Customers can place orders via the link below."
                      : "The public order page is currently disabled for customers."}
                  </p>
                </div>
                <Switch
                  checked={allowPublicOrders}
                  onCheckedChange={togglePublicOrders}
                  disabled={readOnly || savingPublicOrders}
                  aria-label="Toggle public ordering"
                />
              </div>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={`${window.location.origin}/order/${restaurantId}`}
                  className="font-mono text-sm"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/order/${restaurantId}`);
                    toast.success("Link copied to clipboard!");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payment Methods Configuration */}
        {restaurantId && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Payment Methods</CardTitle>
              </div>
              <CardDescription>
                Configure which payment methods are available for orders.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {configuredPaymentMethods.map(method => (
                  <div key={method.name} className="flex items-center gap-2 p-2 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{method.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {method.currency} · Rate: {method.conversion_rate}
                        {method.account_number ? ` · Acct: ${method.account_number}` : ""}
                      </p>
                    </div>
                    {!readOnly && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditMethod(method)}>
                          <Settings className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => removePaymentMethod(method.name)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {!readOnly && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="New payment method..."
                    value={newPaymentMethod}
                    onChange={(e) => setNewPaymentMethod(e.target.value)}
                    className="max-w-xs"
                    maxLength={50}
                    onKeyDown={(e) => e.key === "Enter" && addPaymentMethod()}
                  />
                  <Button size="sm" onClick={addPaymentMethod} disabled={!newPaymentMethod.trim()}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              )}
            </CardContent>

            {/* Edit payment method dialog */}
            <Dialog open={!!editingMethod} onOpenChange={(open) => !open && setEditingMethod(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Configure "{editingMethod?.name}"</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Currency Code</Label>
                    <Input value={editCurrency} onChange={e => setEditCurrency(e.target.value.slice(0, 10))} placeholder="TRY" className="mt-2" maxLength={10} />
                  </div>
                  <div>
                    <Label>Account Number / Details</Label>
                    <Input value={editAccount} onChange={e => setEditAccount(e.target.value.slice(0, 200))} placeholder="e.g. TR12 3456 7890..." className="mt-2" maxLength={200} />
                  </div>
                  <div>
                    <Label>Conversion Rate (1 TRY = ?)</Label>
                    <Input type="number" value={editRate} onChange={e => setEditRate(e.target.value)} placeholder="1" className="mt-2" min={0} step="0.0001" />
                    <p className="text-xs text-muted-foreground mt-1">
                      If 1 TRY = 0.03 USD, enter 0.03. If same currency, keep at 1.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingMethod(null)}>Cancel</Button>
                  <Button onClick={saveEditMethod}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Card>
        )}

        <Tabs defaultValue="staff" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="staff">Staff Management</TabsTrigger>
            <TabsTrigger value="tags">Menu Tags</TabsTrigger>
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
                    {staff.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">No staff members found</p>
                    ) : (
                      staff.map(member => (
                        <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div>
                            <p className="font-medium">{member.full_name}</p>
                            <p className="text-xs text-muted-foreground">ID: {member.id.substring(0, 8)}...</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {readOnly ? (
                              <Badge variant="outline" className="capitalize">
                                {member.role || "—"}
                              </Badge>
                            ) : (
                              <>
                                <Select value={member.role} onValueChange={value => handleRoleChange(member.id, value)}>
                                  <SelectTrigger className="w-32">
                                    <SelectValue placeholder="Assign role" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="server">Server</SelectItem>
                                    <SelectItem value="ops">Ops</SelectItem>
                                    <SelectItem value="counter">Counter</SelectItem>
                                    <SelectItem value="manager">Manager</SelectItem>
                                    <SelectItem value="investor">Observer</SelectItem>
                                  </SelectContent>
                                </Select>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                      <UserMinus className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Remove Staff Member</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to remove {member.full_name} from this restaurant? 
                                        They will lose access to all restaurant data and orders.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction 
                                        onClick={() => handleRemoveStaff(member.id, member.full_name)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Remove
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tags" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  Menu Tags
                </CardTitle>
                <CardDescription>
                  Tag categories to group and filter menu items. A tag can include multiple categories.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Add tag-category mapping */}
                {!readOnly && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const name = newTagName.trim();
                      if (!name || !newTagCategory || !restaurantId) return;
                      const { error } = await supabase.from("menu_tags").insert({
                        name,
                        category: newTagCategory,
                        restaurant_id: restaurantId,
                      });
                      if (error) {
                        if (error.code === '23505') toast.error("This category is already in this tag");
                        else toast.error("Failed to add");
                        return;
                      }
                      setNewTagName("");
                      setNewTagCategory("");
                      invalidateTags();
                      toast.success(`Category "${newTagCategory}" added to tag "${name}"`);
                    }}
                    className="flex flex-wrap gap-2 items-end"
                  >
                    <div className="space-y-1">
                      <Label className="text-xs">Tag Name</Label>
                      <Input
                        placeholder="e.g. Breakfast, Drinks..."
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        maxLength={50}
                        className="w-40"
                        list="existing-tags"
                      />
                      <datalist id="existing-tags">
                        {tagNames.map(n => <option key={n} value={n} />)}
                      </datalist>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Category</Label>
                      <Select value={newTagCategory} onValueChange={setNewTagCategory}>
                        <SelectTrigger className="w-44">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" size="sm" disabled={!newTagName.trim() || !newTagCategory}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </form>
                )}

                {categories.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No menu categories found. Add menu items with categories first.
                  </p>
                )}

                {/* Display grouped tags */}
                {tagsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading tags...</p>
                ) : Object.keys(groupedTags).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tags created yet.</p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(groupedTags).map(([tagName, { categories: tagCats }]) => (
                      <div key={tagName} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-base">{tagName}</h4>
                          {!readOnly && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive h-7 text-xs"
                              onClick={async () => {
                                const ids = tagCats.map(c => c.id);
                                for (const id of ids) {
                                  await supabase.from("menu_tags").delete().eq("id", id);
                                }
                                invalidateTags();
                                toast.success(`Tag "${tagName}" deleted`);
                              }}
                            >
                              Delete Tag
                            </Button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {tagCats.map(({ id, category }) => (
                            <Badge key={id} variant="secondary" className="gap-1 py-1 px-3">
                              {category}
                              {!readOnly && (
                                <button
                                  onClick={async () => {
                                    const { error } = await supabase.from("menu_tags").delete().eq("id", id);
                                    if (error) { toast.error("Failed to remove"); return; }
                                    invalidateTags();
                                    toast.success(`Removed "${category}" from "${tagName}"`);
                                  }}
                                  className="ml-1 hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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

            {loading ? <p className="text-center text-muted-foreground">Loading...</p> : <>
              {/* Summary Totals */}
              {reports.length > 0 && (
                <Card className="bg-primary/5 border-primary/20">
                  <CardHeader>
                    <CardTitle className="text-xl">Period Summary</CardTitle>
                    <CardDescription>Totals for the selected period</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Revenue</p>
                        <p className="text-3xl font-bold text-primary">
                          {formatPrice(
                            reports.reduce((sum, r) => sum + Number(r.total_revenue), 0),
                            reports[0]?.currency || 'TRY'
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Orders</p>
                        <p className="text-3xl font-bold">
                          {reports.reduce((sum, r) => sum + r.total_orders, 0)}
                        </p>
                      </div>
                      <div className="col-span-2 md:col-span-1">
                        <p className="text-sm text-muted-foreground mb-2">By Payment Method</p>
                        <div className="space-y-1">
                          {(() => {
                            const aggregated: Record<string, { count: number; total: number }> = {};
                            reports.forEach(report => {
                              Object.entries(report.payment_methods || {}).forEach(([method, data]) => {
                                if (!aggregated[method]) aggregated[method] = { count: 0, total: 0 };
                                aggregated[method].count += data.count;
                                aggregated[method].total += data.total;
                              });
                            });
                            return Object.entries(aggregated).map(([method, data]) => (
                              <div key={method} className="flex justify-between text-sm">
                                <span>{method}</span>
                                <span className="font-medium">
                                  {data.count} orders · {formatPrice(data.total, reports[0]?.currency || 'TRY')}
                                </span>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Individual Reports */}
              <div className="space-y-3">
                {reports.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <p className="text-muted-foreground">No daily reports found for this period</p>
                    </CardContent>
                  </Card>
                ) : reports.map(report => <Card key={report.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <CardTitle className="text-lg">
                            {format(new Date(report.report_date), "PPP")}
                          </CardTitle>
                          <CardDescription>
                            Staff: {report.profiles?.full_name || "Unknown"}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="text-lg px-4 py-2">
                            {formatPrice(report.total_revenue, report.currency || 'TRY')}
                          </Badge>
                          <Button size="sm" variant="outline" onClick={() => navigate(`/report/${report.id}`)}>
                            View Breakdown
                          </Button>
                        </div>
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
                            {Object.entries(report.payment_methods || {}).map(([method, data]) => <p key={method} className="text-sm">
                                {method}: {data.count} ({formatPrice(data.total, report.currency || 'TRY')})
                              </p>)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>)}
              </div>
            </>}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>;
};
export default Admin;