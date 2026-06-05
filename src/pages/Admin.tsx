import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WorkdayNotes } from "@/components/WorkdayNotes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Shield, Users, ShoppingBag, TrendingUp, TrendingDown, Calendar, AlertCircle, UserMinus, Target, Link2, Copy, Tag, Plus, X } from "lucide-react";
import { format, subDays } from "date-fns";
import { formatPrice } from "@/lib/currency";
import { sumPaidRevenue, sumUnpaidRevenue, dailyBillsTarget } from "@/lib/revenue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate, useNavigate } from "react-router-dom";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { useMenuTags, useInvalidateMenuTags, useMenuItems } from "@/hooks/useQueries";
import { useTabState } from "@/hooks/useTabState";
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
  profiles: { full_name: string };
}
interface DailyReport {
  id: string;
  report_date: string;
  total_orders: number;
  total_revenue: number;
  payment_methods: Record<string, { count: number; total: number }>;
  profiles: { full_name: string };
  currency?: string;
}

type StaffTabId = "staff" | "tags" | "orders" | "reports";

const Admin = () => {
  const navigate = useNavigate();
  const { isManager, canViewReports, loading: roleLoading } = useUserRole();
  const readOnly = !isManager;
  const { restaurantId, loading: restaurantLoading } = useRestaurantContext();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [todayOrders, setTodayOrders] = useState<Order[]>([]);
  const [todayExpenses, setTodayExpenses] = useState<{ amount: number; created_at: string }[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useTabState<string>("adminDateFilter", "7");
  const [fixedDailyBills, setFixedDailyBills] = useState<number>(0);
  const [fixedMonthlyExpenses, setFixedMonthlyExpenses] = useState<number>(0);
  const [newTagName, setNewTagName] = useState("");
  const [newTagCategory, setNewTagCategory] = useState("");
  const [storeCurrency, setStoreCurrency] = useState<string>("TRY");

  const [staffTab, setStaffTab] = useTabState<StaffTabId>("adminStaffTab", "staff");

  const { data: menuTags = [], isLoading: tagsLoading } = useMenuTags();
  const invalidateTags = useInvalidateMenuTags();
  const { data: menuItemsData = [] } = useMenuItems();

  const categories = useMemo(() => {
    const cats = new Set<string>();
    (menuItemsData as any[]).forEach(item => { if (item.category) cats.add(item.category); });
    return Array.from(cats).sort();
  }, [menuItemsData]);

  const groupedTags = useMemo(() => {
    const groups: Record<string, { categories: { id: string; category: string }[] }> = {};
    (menuTags as any[]).forEach(tag => {
      if (!groups[tag.name]) groups[tag.name] = { categories: [] };
      if (tag.category) groups[tag.name].categories.push({ id: tag.id, category: tag.category });
    });
    return groups;
  }, [menuTags]);

  const tagNames = useMemo(() => Object.keys(groupedTags).sort(), [groupedTags]);

  useEffect(() => {
    if (canViewReports && restaurantId) {
      fetchData();
      fetchSettingsForDashboard();
    }
  }, [canViewReports, restaurantId, dateFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchStaff(), fetchOrders(), fetchTodayOrders(), fetchTodayExpenses(), fetchReports()]);
    } catch {
      toast.error("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  const fetchSettingsForDashboard = async () => {
    if (!restaurantId) return;
    const { data } = await supabase
      .from("restaurant_settings")
      .select("fixed_daily_bills, fixed_monthly_expenses, currency")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (data) {
      setFixedDailyBills(Number((data as any).fixed_daily_bills) || 0);
      setFixedMonthlyExpenses(Number((data as any).fixed_monthly_expenses) || 0);
      setStoreCurrency((((data as any).currency as string | undefined) || "TRY").toUpperCase());
    }
  };

  const fetchTodayOrders = async () => {
    if (!restaurantId) return;
    const { data: latestReport } = await supabase
      .from("daily_reports")
      .select("created_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let query = supabase.from("orders").select("*").eq("restaurant_id", restaurantId);
    if (latestReport?.created_at) {
      const cutoff = latestReport.created_at;
      query = query.or(`created_at.gt.${cutoff},paid_at.gt.${cutoff}`);
    }
    const { data: ordersData } = await query;
    if (!ordersData || ordersData.length === 0) { setTodayOrders([]); return; }

    const staffIds = [...new Set(ordersData.map(o => o.staff_id))];
    const { data: profilesData } = await supabase.from("profiles").select("id, full_name").in("id", staffIds);
    const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
    setTodayOrders(ordersData.map(o => ({ ...o, profiles: profilesMap.get(o.staff_id) || { full_name: "Unknown" } })) as any);
  };

  const fetchTodayExpenses = async () => {
    if (!restaurantId) { setTodayExpenses([]); return; }
    const { data: latestReport } = await supabase
      .from("daily_reports")
      .select("created_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // Restock expenses are excluded from the daily total — they deduct from
    // the monthly P&L instead (see Reports month view).
    let q = supabase
      .from("daily_expenses")
      .select("amount, created_at, source")
      .eq("restaurant_id", restaurantId)
      .or("source.is.null,source.neq.restock");
    if (latestReport?.created_at) q = q.gt("created_at", latestReport.created_at);
    const { data } = await q;
    setTodayExpenses((data || []) as any);
  };

  const fetchStaff = async () => {
    if (!restaurantId) { setStaff([]); return; }
    const { data: memberships, error: membershipsError } = await supabase
      .from("restaurant_memberships")
      .select("user_id")
      .eq("restaurant_id", restaurantId);
    if (membershipsError) throw membershipsError;
    const userIds = (memberships || []).map(m => m.user_id);
    if (userIds.length === 0) { setStaff([]); return; }

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

    // Identify any superadmins amongst these users (global role rows have null restaurant_id).
    const { data: superRows } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "superadmin")
      .in("user_id", userIds);
    const superIds = new Set((superRows || []).map(r => r.user_id));

    // Hide superadmins from the staff list entirely.
    const staffMembers: StaffMember[] = (profiles || [])
      .filter(p => !superIds.has(p.id))
      .map(profile => {
        const userRole = roles?.find(r => r.user_id === profile.id);
        return { id: profile.id, email: "", full_name: profile.full_name, role: userRole?.role || "" };
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
    if (!ordersData || ordersData.length === 0) { setOrders([]); return; }
    const staffIds = [...new Set(ordersData.map(o => o.staff_id))];
    const { data: profilesData } = await supabase.from("profiles").select("id, full_name").in("id", staffIds);
    const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
    setOrders(ordersData.map(o => ({ ...o, profiles: profilesMap.get(o.staff_id) || { full_name: "Unknown" } })) as any);
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
    if (!reportsData || reportsData.length === 0) { setReports([]); return; }

    const staffIds = [...new Set(reportsData.map(r => r.staff_id))];
    const { data: profilesData } = await supabase.from("profiles").select("id, full_name").in("id", staffIds);
    const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);

    const reportsWithCurrency = await Promise.all(reportsData.map(async report => {
      const { data: firstOrder } = await supabase
        .from("orders")
        .select("currency")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", report.report_date)
        .lt("created_at", format(new Date(new Date(report.report_date).getTime() + 86400000), "yyyy-MM-dd"))
        .limit(1)
        .maybeSingle();
      return { ...report, profiles: profilesMap.get(report.staff_id) || { full_name: "Unknown" }, currency: firstOrder?.currency || 'TRY' };
    }));
    setReports(reportsWithCurrency as any);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      if (!restaurantId) throw new Error("Restaurant not selected");
      await supabase.from("user_roles").delete().eq("user_id", userId).eq("restaurant_id", restaurantId);
      const { error } = await supabase.from("user_roles").insert([{
        user_id: userId,
        role: newRole as "server" | "ops" | "counter" | "manager" | "investor",
        restaurant_id: restaurantId,
      }]);
      if (error) throw error;
      toast.success("Role updated successfully");
      fetchStaff();
    } catch {
      toast.error("Failed to update role");
    }
  };

  const handleRemoveStaff = async (userId: string, userName: string) => {
    try {
      if (!restaurantId) throw new Error("Restaurant not selected");
      await supabase.from("user_roles").delete().eq("user_id", userId).eq("restaurant_id", restaurantId);
      const { error } = await supabase.from("restaurant_memberships").delete().eq("user_id", userId).eq("restaurant_id", restaurantId);
      if (error) throw error;
      toast.success(`${userName} has been removed from the restaurant`);
      fetchStaff();
    } catch {
      toast.error("Failed to remove staff member");
    }
  };

  if (roleLoading || restaurantLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground">Loading...</p></div>;
  }
  if (!canViewReports) return <Navigate to="/" replace />;

  const todayPaidRevenue = sumPaidRevenue(todayOrders as any);
  const todayUnpaidTotal = sumUnpaidRevenue(todayOrders as any);
  const todayExpensesTotal = todayExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const todayRevenue = todayPaidRevenue - todayExpensesTotal;
  const pendingStaff = staff.filter(s => !s.role);

  const staffTabs: { id: StaffTabId; label: string }[] = [
    { id: "staff", label: "Staff Management" },
    { id: "tags", label: "Menu Tags" },
    { id: "orders", label: "All Orders" },
    { id: "reports", label: "Daily Reports" },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="px-4 md:px-5 pt-2 space-y-4">
        {pendingStaff.length > 0 && (
          <Card className="border-yellow-500/50 bg-yellow-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-yellow-700">
                <AlertCircle className="h-5 w-5" />
                {pendingStaff.length} staff {pendingStaff.length === 1 ? 'member needs' : 'members need'} a role assigned
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Scroll to Staff Management to assign roles.
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl md:text-3xl font-bold">Admin</h2>
            <p className="text-sm text-muted-foreground">Daily operations and staff</p>
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-4 md:px-5 py-4 md:py-6 space-y-5">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2"><Users className="h-4 w-4" />Total Staff</CardDescription>
              <CardTitle className="text-3xl">{staff.length}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2"><ShoppingBag className="h-4 w-4" />Today's Orders</CardDescription>
              <CardTitle className="text-3xl">{todayOrders.length}</CardTitle>
              {todayUnpaidTotal > 0 && (
                <CardDescription className="text-xs text-amber-600">
                  -{formatPrice(todayUnpaidTotal, storeCurrency)} unpaid
                </CardDescription>
              )}
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2"><TrendingUp className="h-4 w-4" />Today's Revenue</CardDescription>
              <CardTitle className="text-3xl">{formatPrice(todayRevenue, todayOrders[0]?.currency || storeCurrency)}</CardTitle>
              <CardDescription className="text-xs">
                Paid {formatPrice(todayPaidRevenue, storeCurrency)} − Expenses {formatPrice(todayExpensesTotal, storeCurrency)}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2"><TrendingDown className="h-4 w-4" />Today's Expenses</CardDescription>
              <CardTitle className="text-3xl text-destructive">{formatPrice(todayExpensesTotal, storeCurrency)}</CardTitle>
              <CardDescription className="text-xs">
                {todayExpenses.length} entr{todayExpenses.length === 1 ? 'y' : 'ies'} since last End Day
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Daily Bills Target */}
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
                ? `Auto-calculated: ${formatPrice(fixedMonthlyExpenses, storeCurrency)} ÷ 30 = ${formatPrice(fixedMonthlyExpenses / 30, storeCurrency)}/day`
                : "Add monthly bills under Settings to auto-calculate your daily target (monthly ÷ 30)."}
            </CardDescription>
          </CardHeader>
          {fixedMonthlyExpenses > 0 && (() => {
            const dailyTarget = dailyBillsTarget(fixedMonthlyExpenses);
            const progressRevenue = todayPaidRevenue;
            return (
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Paid Revenue vs Daily Bills</span>
                  <span className="font-medium">
                    {formatPrice(progressRevenue, storeCurrency)} / {formatPrice(dailyTarget, storeCurrency)}
                  </span>
                </div>
                <Progress value={Math.min(100, (progressRevenue / dailyTarget) * 100)} className="h-4" />
                <p className={`text-sm font-medium ${progressRevenue >= dailyTarget ? "text-green-600" : "text-amber-600"}`}>
                  {progressRevenue >= dailyTarget
                    ? `✓ Bills covered! ${formatPrice(progressRevenue - dailyTarget, storeCurrency)} above target`
                    : `${formatPrice(dailyTarget - progressRevenue, storeCurrency)} more needed`}
                </p>
              </CardContent>
            );
          })()}
        </Card>

        <WorkdayNotes restaurantId={restaurantId} />

        {/* Staff Management — state-based tab switcher to avoid remounts */}
        <div className="space-y-4">
          <div className="inline-flex p-[3px] gap-[3px] bg-muted rounded-lg border border-border flex-wrap">
            {staffTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setStaffTab(t.id)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-150 min-h-[36px] ${
                  staffTab === t.id ? "bg-background text-foreground shadow-sm" : "bg-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {staffTab === "staff" && (
            <div className="space-y-4">
              {!readOnly && restaurantId && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Link2 className="h-4 w-4" /> Staff Invite Link</CardTitle>
                    <CardDescription>Share this link so staff can sign up and join this business. Assign them a role after they register.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const inviteUrl = `${window.location.origin}/auth?join=${restaurantId}`;
                      return (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Input readOnly value={inviteUrl} className="flex-1 min-w-[200px] font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                          <Button variant="outline" onClick={async () => {
                            try { await navigator.clipboard.writeText(inviteUrl); toast.success("Invite link copied"); }
                            catch { toast.error("Could not copy"); }
                          }}><Copy className="h-4 w-4 mr-2" /> Copy</Button>
                          {typeof navigator !== "undefined" && (navigator as any).share && (
                            <Button variant="outline" onClick={async () => {
                              try { await (navigator as any).share({ title: "Join our team", text: "Sign up to join us on CoreOS", url: inviteUrl }); } catch {}
                            }}>Share</Button>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>Users</CardTitle>
                  <CardDescription>Manage staff roles and permissions</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? <p className="text-center text-muted-foreground">Loading...</p> : (
                    <div className="space-y-3">
                      {staff.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No staff members found</p>
                      ) : (
                        staff.map(member => (
                          <div key={member.id} className="flex items-center justify-between gap-2 p-4 border rounded-lg flex-wrap">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{member.full_name}</p>
                              <p className="text-xs text-muted-foreground">ID: {member.id.substring(0, 8)}...</p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {readOnly ? (
                                <Badge variant="outline" className="capitalize">{member.role || "—"}</Badge>
                              ) : (
                                <>
                                  <Select value={member.role} onValueChange={value => handleRoleChange(member.id, value)}>
                                    <SelectTrigger className="w-32 min-h-[40px]"><SelectValue placeholder="Assign role" /></SelectTrigger>
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
                                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive min-h-[40px] min-w-[40px]">
                                        <UserMinus className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Remove Staff Member</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Are you sure you want to remove {member.full_name} from this restaurant? They will lose access to all restaurant data and orders.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleRemoveStaff(member.id, member.full_name)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {staffTab === "tags" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5" />Menu Tags</CardTitle>
                <CardDescription>Tag categories to group and filter menu items. A tag can include multiple categories.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!readOnly && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const name = newTagName.trim();
                      if (!name || !newTagCategory || !restaurantId) return;
                      const { error } = await supabase.from("menu_tags").insert({ name, category: newTagCategory, restaurant_id: restaurantId });
                      if (error) {
                        if (error.code === '23505') toast.error("This category is already in this tag");
                        else toast.error("Failed to add");
                        return;
                      }
                      setNewTagName(""); setNewTagCategory(""); invalidateTags();
                      toast.success(`Category "${newTagCategory}" added to tag "${name}"`);
                    }}
                    className="flex flex-wrap gap-2 items-end"
                  >
                    <div className="space-y-1">
                      <Label className="text-xs">Tag Name</Label>
                      <Input placeholder="e.g. Breakfast, Drinks..." value={newTagName} onChange={(e) => setNewTagName(e.target.value)} maxLength={50} className="w-40" list="existing-tags" />
                      <datalist id="existing-tags">{tagNames.map(n => <option key={n} value={n} />)}</datalist>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Category</Label>
                      <Select value={newTagCategory} onValueChange={setNewTagCategory}>
                        <SelectTrigger className="w-44"><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>{categories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" size="sm" disabled={!newTagName.trim() || !newTagCategory}><Plus className="h-4 w-4 mr-1" />Add</Button>
                  </form>
                )}
                {categories.length === 0 && <p className="text-sm text-muted-foreground">No menu categories found. Add menu items with categories first.</p>}
                {tagsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading tags...</p>
                ) : Object.keys(groupedTags).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tags created yet.</p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(groupedTags).map(([tagName, { categories: tagCats }]) => (
                      <div key={tagName} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <h4 className="font-semibold text-base">{tagName}</h4>
                          {!readOnly && (
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-7 text-xs"
                              onClick={async () => {
                                const ids = tagCats.map(c => c.id);
                                for (const id of ids) await supabase.from("menu_tags").delete().eq("id", id);
                                invalidateTags();
                                toast.success(`Tag "${tagName}" deleted`);
                              }}>Delete Tag</Button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {tagCats.map(({ id, category }) => (
                            <Badge key={id} variant="secondary" className="gap-1 py-1 px-3">
                              {category}
                              {!readOnly && (
                                <button onClick={async () => {
                                  const { error } = await supabase.from("menu_tags").delete().eq("id", id);
                                  if (error) { toast.error("Failed to remove"); return; }
                                  invalidateTags();
                                  toast.success(`Removed "${category}" from "${tagName}"`);
                                }} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
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
          )}

          {staffTab === "orders" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h3 className="text-lg font-semibold">All Orders</h3>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Last 24 hours</SelectItem>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {loading ? <p className="text-center text-muted-foreground">Loading...</p> : (
                <div className="space-y-3">
                  {orders.map(order => (
                    <Card key={order.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold">Order #{order.order_number}</p>
                              <Badge variant="outline">{order.payment_method}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">Staff: {order.profiles?.full_name || "Public Order"}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />{format(new Date(order.created_at), "PPp")}
                            </p>
                          </div>
                          <p className="text-2xl font-bold text-primary font-mono">{formatPrice(order.total, order.currency)}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {staffTab === "reports" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h3 className="text-lg font-semibold">Daily Reports</h3>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {loading ? <p className="text-center text-muted-foreground">Loading...</p> : (
                <>
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
                            <p className="text-3xl font-bold text-primary font-mono">
                              {formatPrice(reports.reduce((sum, r) => sum + Number(r.total_revenue), 0), reports[0]?.currency || storeCurrency)}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Total Orders</p>
                            <p className="text-3xl font-bold font-mono">{reports.reduce((sum, r) => sum + r.total_orders, 0)}</p>
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
                                    <span className="font-medium font-mono">{data.count} orders · {formatPrice(data.total, reports[0]?.currency || storeCurrency)}</span>
                                  </div>
                                ));
                              })()}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  <div className="space-y-3">
                    {reports.length === 0 ? (
                      <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">No daily reports found for this period</p></CardContent></Card>
                    ) : reports.map(report => (
                      <Card key={report.id}>
                        <CardHeader>
                          <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div>
                              <CardTitle className="text-lg">{format(new Date(report.report_date), "PPP")}</CardTitle>
                              <CardDescription>Staff: {report.profiles?.full_name || "Unknown"}</CardDescription>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                              <Badge variant="outline" className="text-lg px-4 py-2 font-mono">{formatPrice(report.total_revenue, report.currency || storeCurrency)}</Badge>
                              <Button size="sm" variant="outline" onClick={() => navigate(`/report/${report.id}`)}>View Breakdown</Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-muted-foreground">Total Orders</p>
                              <p className="text-2xl font-bold font-mono">{report.total_orders}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Payment Methods</p>
                              <div className="mt-1 space-y-1">
                                {Object.entries(report.payment_methods || {}).map(([method, data]) => (
                                  <p key={method} className="text-sm">{method}: {data.count} ({formatPrice(data.total, report.currency || storeCurrency)})</p>
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Admin;
