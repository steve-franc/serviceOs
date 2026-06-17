import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Settings,
  AlertCircle,
  Calendar,
  Image as ImageIcon,
  Link2,
  ShoppingBag,
  Save,
  Plus,
  X,
  Copy,
  Upload,
  Trash2,
} from "lucide-react";
import { formatPrice, SUPPORTED_CURRENCIES, setActiveCurrency } from "@/lib/currency";
import { dailyShareOfMonthly, daysInMonth } from "@/lib/date-format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { PaymentMethodConfig, parsePaymentMethods } from "@/lib/payment-methods";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTabState } from "@/hooks/useTabState";
import { applyBrandTheme, hexToHsl, hslToHex, hslString, parseHslString } from "@/lib/brand-theme";
import { Paintbrush } from "lucide-react";

type PanelId = "bills" | "alerts" | "branding" | "public" | "payment";

const AdminSettings = () => {
  const { isManager, isInvestor, canViewReports, loading: roleLoading } = useUserRole();
  const readOnly = !isManager;
  const { restaurantId, loading: restaurantLoading } = useRestaurantContext();

  const [panel, setPanel] = useTabState<PanelId>("settingsPanel", "bills");

  // Settings state
  const [fixedMonthlyExpenses, setFixedMonthlyExpenses] = useState<number>(0);
  const [monthlyBills, setMonthlyBills] = useState<{ name: string; amount: number }[]>([]);
  const [billsDialogOpen, setBillsDialogOpen] = useState(false);
  const [editBills, setEditBills] = useState<{ name: string; amount: number }[]>([]);

  const [profitMarginThreshold, setProfitMarginThreshold] = useState<number>(20);
  const [thresholdInput, setThresholdInput] = useState("");

  const [configuredPaymentMethods, setConfiguredPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [newPaymentMethod, setNewPaymentMethod] = useState("");
  const [editingMethod, setEditingMethod] = useState<PaymentMethodConfig | null>(null);
  const [editCurrency, setEditCurrency] = useState("");
  const [editAccount, setEditAccount] = useState("");
  const [editRate, setEditRate] = useState("");

  const [allowPublicOrders, setAllowPublicOrders] = useState<boolean>(true);
  const [savingPublicOrders, setSavingPublicOrders] = useState(false);

  const [restaurantLogoUrl, setRestaurantLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [storeCurrency, setStoreCurrency] = useState<string>("TRY");
  const [savingCurrency, setSavingCurrency] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    (async () => {
      const { data } = await supabase
        .from("restaurant_settings")
        .select("payment_methods, fixed_monthly_expenses, profit_margin_threshold, monthly_bills, allow_public_orders, logo_url, currency")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      if (!data) return;
      setConfiguredPaymentMethods(parsePaymentMethods((data as any).payment_methods));
      setFixedMonthlyExpenses(Number((data as any).fixed_monthly_expenses) || 0);
      const bills = (data as any).monthly_bills;
      setMonthlyBills(Array.isArray(bills) ? bills : []);
      setProfitMarginThreshold(Number((data as any).profit_margin_threshold) || 20);
      setThresholdInput(String((data as any).profit_margin_threshold || 20));
      setAllowPublicOrders(Boolean((data as any).allow_public_orders ?? true));
      setRestaurantLogoUrl((data as any).logo_url ?? null);
      const cur = (((data as any).currency as string | undefined) || "TRY").toUpperCase();
      setStoreCurrency(cur);
    })();
  }, [restaurantId]);

  const saveStoreCurrency = async (next: string) => {
    if (!restaurantId) return;
    const previous = storeCurrency;
    setStoreCurrency(next);
    setSavingCurrency(true);
    const { error } = await supabase.from("restaurant_settings").update({ currency: next } as any).eq("restaurant_id", restaurantId);
    setSavingCurrency(false);
    if (error) { setStoreCurrency(previous); toast.error("Failed to update currency"); return; }
    setActiveCurrency(next);
    toast.success(`Store currency set to ${next}`);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !restaurantId) return;
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be smaller than 5MB"); return; }
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${restaurantId}/logo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("restaurant-logos").upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from("restaurant-logos").getPublicUrl(path);
      const publicUrl = pub.publicUrl;
      const { error: updateError } = await supabase.from("restaurant_settings").update({ logo_url: publicUrl } as any).eq("restaurant_id", restaurantId);
      if (updateError) throw updateError;
      setRestaurantLogoUrl(publicUrl);
      toast.success("Logo updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload logo");
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  };

  const removeLogo = async () => {
    if (!restaurantId) return;
    setUploadingLogo(true);
    try {
      const { error } = await supabase.from("restaurant_settings").update({ logo_url: null } as any).eq("restaurant_id", restaurantId);
      if (error) throw error;
      setRestaurantLogoUrl(null);
      toast.success("Logo removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const togglePublicOrders = async (next: boolean) => {
    if (!restaurantId) return;
    setSavingPublicOrders(true);
    const previous = allowPublicOrders;
    setAllowPublicOrders(next);
    const { error } = await supabase.from("restaurant_settings").update({ allow_public_orders: next }).eq("restaurant_id", restaurantId);
    setSavingPublicOrders(false);
    if (error) { setAllowPublicOrders(previous); toast.error("Failed to update public orders setting"); return; }
    toast.success(next ? "Public ordering enabled" : "Public ordering disabled");
  };

  const saveMonthlyBills = async (bills: { name: string; amount: number }[]) => {
    if (!restaurantId) return;
    const total = bills.reduce((s, b) => s + b.amount, 0);
    const { error } = await supabase.from("restaurant_settings").update({ fixed_monthly_expenses: total, monthly_bills: bills } as any).eq("restaurant_id", restaurantId);
    if (error) { toast.error("Failed to save"); return; }
    setMonthlyBills(bills);
    setFixedMonthlyExpenses(total);
    setBillsDialogOpen(false);
    toast.success("Monthly bills updated");
  };

  const saveProfitThreshold = async () => {
    if (!restaurantId) return;
    const value = parseFloat(thresholdInput) || 20;
    const { error } = await supabase.from("restaurant_settings").update({ profit_margin_threshold: value } as any).eq("restaurant_id", restaurantId);
    if (error) { toast.error("Failed to save"); return; }
    setProfitMarginThreshold(value);
    toast.success("Profit margin threshold updated");
  };

  const savePaymentMethods = async (updated: PaymentMethodConfig[]) => {
    if (!restaurantId) return false;
    const { data: existing } = await supabase.from("restaurant_settings").select("id").eq("restaurant_id", restaurantId).maybeSingle();
    const { error } = existing
      ? await supabase.from("restaurant_settings").update({ payment_methods: updated as any }).eq("restaurant_id", restaurantId)
      : await supabase.from("restaurant_settings").insert({ restaurant_id: restaurantId, payment_methods: updated as any });
    if (error) { toast.error("Failed to save payment methods"); return false; }
    setConfiguredPaymentMethods(updated);
    return true;
  };

  const addPaymentMethod = async () => {
    const method = newPaymentMethod.trim();
    if (!method || !restaurantId) return;
    if (configuredPaymentMethods.some(m => m.name === method)) { toast.error("Payment method already exists"); return; }
    const newConfig: PaymentMethodConfig = { name: method, currency: "TRY", account_number: "", conversion_rate: 1 };
    const updated = [...configuredPaymentMethods, newConfig];
    if (await savePaymentMethods(updated)) { setNewPaymentMethod(""); toast.success(`Added "${method}"`); }
  };

  const PROTECTED_METHODS = ["cash", "card", "credit card"];
  const isProtectedMethod = (name: string) => PROTECTED_METHODS.includes(name.trim().toLowerCase());

  const removePaymentMethod = async (methodName: string) => {
    if (!restaurantId) return;
    if (isProtectedMethod(methodName)) { toast.error(`"${methodName}" is a default method and can't be removed`); return; }
    const updated = configuredPaymentMethods.filter(m => m.name !== methodName);
    if (updated.length === 0) { toast.error("Must have at least one payment method"); return; }
    if (await savePaymentMethods(updated)) toast.success(`Removed "${methodName}"`);
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
    if (await savePaymentMethods(updated)) { toast.success(`Updated "${editingMethod.name}"`); setEditingMethod(null); }
  };

  if (roleLoading || restaurantLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground">Loading...</p></div>;
  }
  if (!canViewReports) return <Navigate to="/" replace />;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="px-4 md:px-5 pt-2 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Settings className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl md:text-3xl font-bold">Settings</h2>
            <p className="text-sm text-muted-foreground">Store configuration, branding, and payment methods</p>
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-4 md:px-5 py-2 md:py-4">
        <div className="grid gap-4 md:grid-cols-[200px_1fr] items-start">
          <div className="bg-card border border-border rounded-xl p-2 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
            {([
              { id: "bills", label: "Monthly Bills", icon: Calendar },
              { id: "alerts", label: "Profit Alerts", icon: AlertCircle },
              { id: "branding", label: "Branding", icon: ImageIcon },
              { id: "public", label: "Public Ordering", icon: Link2 },
              { id: "payment", label: "Payment Methods", icon: ShoppingBag },
            ] as const).map((item) => {
              const Icon = item.icon;
              const active = panel === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPanel(item.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg transition-colors duration-150 flex-shrink-0 whitespace-nowrap min-h-[40px] md:rounded-md md:w-full md:justify-start justify-center max-md:rounded-full ${
                    active
                      ? "bg-muted text-foreground font-medium"
                      : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="max-[420px]:hidden md:inline">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-4 min-w-0">
            {panel === "bills" && (
              <Card className="border-primary/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">Fixed Monthly Expenses</CardTitle>
                    </div>
                    {!readOnly && (
                      <Button variant="outline" size="sm" onClick={() => { setEditBills(monthlyBills.length > 0 ? [...monthlyBills] : [{ name: "", amount: 0 }]); setBillsDialogOpen(true); }}>
                        {monthlyBills.length > 0 ? "Edit Bills" : "Add Bills"}
                      </Button>
                    )}
                  </div>
                  <CardDescription>
                    {fixedMonthlyExpenses > 0
                      ? `${formatPrice(fixedMonthlyExpenses, storeCurrency)}/month → ${formatPrice(dailyShareOfMonthly(fixedMonthlyExpenses), storeCurrency)}/day (÷ ${daysInMonth()} days this month) deducted from daily profit`
                      : "Add your monthly fixed costs (rent, salaries, etc.) to deduct daily from profits"}
                  </CardDescription>
                </CardHeader>
                {monthlyBills.length > 0 && (
                  <CardContent>
                    <div className="space-y-1">
                      {monthlyBills.map((bill, i) => (
                        <div key={i} className="flex justify-between text-sm py-1 border-b border-border last:border-b-0">
                          <span className="text-muted-foreground">{bill.name}</span>
                          <span className="font-medium font-mono">{formatPrice(bill.amount, storeCurrency)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold pt-3 mt-2 border-t border-border">
                        <span>Total</span>
                        <span className="font-mono">{formatPrice(fixedMonthlyExpenses, storeCurrency)}</span>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            )}

            {panel === "alerts" && (
              <Card className="border-primary/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">Low Profit Alert Threshold</CardTitle>
                    </div>
                  </div>
                  <CardDescription>Alert when daily profit margin drops below {profitMarginThreshold}%</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg bg-muted p-4 mb-4 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground">
                      You'll get a notification any day your profit margin drops under <span className="font-medium font-mono">{profitMarginThreshold}%</span>.
                    </p>
                  </div>
                  {!readOnly && (
                    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))] items-end">
                      <div>
                        <Label className="text-xs">Threshold (%)</Label>
                        <Input type="number" value={thresholdInput} onChange={(e) => setThresholdInput(e.target.value)} min={0} max={100} step="1" className="mt-1.5" />
                      </div>
                      <Button onClick={saveProfitThreshold} className="min-h-[40px]"><Save className="h-3.5 w-3.5 mr-1" />Save Changes</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {panel === "branding" && restaurantId && (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2"><ImageIcon className="h-5 w-5 text-primary" /><CardTitle className="text-lg">Restaurant Logo</CardTitle></div>
                    <CardDescription>Upload a logo to replace the default placeholder across the app and your public order page.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="h-[60px] w-[60px] rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0 overflow-hidden border">
                        {restaurantLogoUrl ? <img src={restaurantLogoUrl} alt="Restaurant logo" className="h-full w-full object-cover" /> : <ImageIcon className="h-7 w-7 text-primary-foreground" />}
                      </div>
                      {!readOnly && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <label>
                            <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                            <Button asChild variant="outline" size="sm" disabled={uploadingLogo}>
                              <span className="cursor-pointer"><Upload className="h-4 w-4 mr-2" />{uploadingLogo ? "Uploading..." : restaurantLogoUrl ? "Replace logo" : "Upload logo"}</span>
                            </Button>
                          </label>
                          {restaurantLogoUrl && (
                            <Button variant="outline" size="sm" onClick={removeLogo} disabled={uploadingLogo} className="text-destructive border-destructive/30 bg-destructive/10 hover:bg-destructive/15 hover:text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />Remove
                            </Button>
                          )}
                          <p className="text-xs text-muted-foreground w-full">PNG, JPG, or SVG. Max 5MB.</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2"><Settings className="h-5 w-5 text-primary" /><CardTitle className="text-lg">Store Currency</CardTitle></div>
                    <CardDescription>Currency used across menu prices, orders, expenses, reports, and your public order page. Platform subscription billing is unaffected.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                      <Select value={storeCurrency} onValueChange={saveStoreCurrency} disabled={readOnly || savingCurrency}>
                        <SelectTrigger className="min-h-[40px]"><SelectValue placeholder="Select currency" /></SelectTrigger>
                        <SelectContent className="max-h-80">
                          {SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.symbol} · {c.code} — {c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center text-xs text-muted-foreground font-mono">Sample: {formatPrice(1234.5, storeCurrency)}</div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">Existing records are not converted — only the symbol changes for display.</p>
                  </CardContent>
                </Card>
              </>
            )}

            {panel === "public" && restaurantId && (
              <Card className="border-accent/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2"><Link2 className="h-5 w-5 text-accent-foreground" /><CardTitle className="text-lg">Public Ordering Link</CardTitle></div>
                  <CardDescription>Share this link with customers so they can order directly from your menu — no sign-in required.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-muted p-4 flex-wrap">
                    <div className="space-y-0.5 pr-3 min-w-0">
                      <Label className="text-sm font-medium">Accept public orders</Label>
                      <p className={`text-xs ${allowPublicOrders ? "text-emerald-600" : "text-destructive"}`}>
                        {allowPublicOrders ? "Customers can place orders via the link below." : "The public order page is currently disabled for customers."}
                      </p>
                    </div>
                    <Switch checked={allowPublicOrders} onCheckedChange={togglePublicOrders} disabled={readOnly || savingPublicOrders} aria-label="Toggle public ordering" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input readOnly value={`${window.location.origin}/order/${restaurantId}`} className="font-mono text-sm flex-1 min-w-[180px]" onClick={(e) => (e.target as HTMLInputElement).select()} />
                    <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/order/${restaurantId}`); toast.success("Link copied to clipboard!"); }}>
                      <Copy className="h-4 w-4 mr-1.5" />Copy
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => window.open(`${window.location.origin}/order/${restaurantId}`, "_blank")}>
                      <Link2 className="h-4 w-4 mr-1.5" />Open
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {panel === "payment" && restaurantId && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2"><ShoppingBag className="h-5 w-5 text-primary" /><CardTitle className="text-lg">Payment Methods</CardTitle></div>
                      <CardDescription className="mt-1">Configure which payment methods are available for orders.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {configuredPaymentMethods.map(method => (
                      <div key={method.name} className="flex items-center gap-2 p-3 border rounded-lg flex-wrap">
                        <div className="h-[34px] w-[34px] rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                          <ShoppingBag className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{method.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {method.currency} · Rate: {method.conversion_rate}{method.account_number ? ` · Acct: ${method.account_number}` : ""}
                          </p>
                        </div>
                        {!readOnly && (
                          <>
                            <Button variant="ghost" size="icon" className="h-9 w-9 min-h-[40px]" onClick={() => openEditMethod(method)}><Settings className="h-4 w-4" /></Button>
                            {!isProtectedMethod(method.name) && (
                              <Button variant="ghost" size="icon" className="h-9 w-9 min-h-[40px] text-destructive hover:text-destructive" onClick={() => removePaymentMethod(method.name)}><X className="h-4 w-4" /></Button>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  {!readOnly && (
                    <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-border">
                      <Input placeholder="New payment method..." value={newPaymentMethod} onChange={(e) => setNewPaymentMethod(e.target.value)} className="flex-1 min-w-[140px]" maxLength={50} onKeyDown={(e) => e.key === "Enter" && addPaymentMethod()} />
                      <Button size="sm" onClick={addPaymentMethod} disabled={!newPaymentMethod.trim()} className="min-h-[40px]"><Plus className="h-4 w-4 mr-1" />Add</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Root-level Dialogs */}
      <Dialog open={billsDialogOpen} onOpenChange={setBillsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Monthly Fixed Bills</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-auto">
            {editBills.map((bill, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="Bill name (e.g. Rent)" value={bill.name} onChange={(e) => { const n = [...editBills]; n[i] = { ...n[i], name: e.target.value }; setEditBills(n); }} className="flex-1" maxLength={100} />
                <Input type="number" placeholder="Amount" value={bill.amount || ""} onChange={(e) => { const n = [...editBills]; n[i] = { ...n[i], amount: parseFloat(e.target.value) || 0 }; setEditBills(n); }} className="w-28" min={0} step="0.01" />
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 hover:text-destructive" onClick={() => setEditBills(editBills.filter((_, idx) => idx !== i))}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" onClick={() => setEditBills([...editBills, { name: "", amount: 0 }])}><Plus className="h-4 w-4 mr-1" /> Add Bill</Button>
            <Separator />
            <div className="flex justify-between font-bold"><span>Total</span><span className="font-mono">{formatPrice(editBills.reduce((s, b) => s + b.amount, 0), storeCurrency)}</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBillsDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => { const valid = editBills.filter(b => b.name.trim() && b.amount > 0); saveMonthlyBills(valid); }}>Save Bills</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingMethod} onOpenChange={(open) => !open && setEditingMethod(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Configure "{editingMethod?.name}"</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Currency Code</Label><Input value={editCurrency} onChange={e => setEditCurrency(e.target.value.slice(0, 10))} placeholder="TRY" className="mt-2" maxLength={10} /></div>
            <div><Label>Account Number / Details</Label><Input value={editAccount} onChange={e => setEditAccount(e.target.value.slice(0, 200))} placeholder="e.g. TR12 3456 7890..." className="mt-2" maxLength={200} /></div>
            <div>
              <Label>Conversion Rate (1 TRY = ?)</Label>
              <Input type="number" value={editRate} onChange={e => setEditRate(e.target.value)} placeholder="1" className="mt-2" min={0} step="0.0001" />
              <p className="text-xs text-muted-foreground mt-1">If 1 TRY = 0.03 USD, enter 0.03. If same currency, keep at 1.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMethod(null)}>Cancel</Button>
            <Button onClick={saveEditMethod}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSettings;
