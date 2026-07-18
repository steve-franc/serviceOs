import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { useUserRole } from "@/hooks/useRestaurantAndRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { formatPrice, formatPriceCompact } from "@/lib/currency";
import { Plus, TrendingUp, TrendingDown, Minus, Package, Truck, Receipt, AlertTriangle, BarChart3, Trash2, ImageIcon, ScanLine, CheckCircle2, Clock, FileText } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";
import { format, parseISO, differenceInDays } from "date-fns";
import { ReceiptScanner, type ScannedReceipt } from "@/components/ReceiptScanner";
import { BillsSection } from "@/components/BillsSection";

interface Supplier {
  id: string;
  supplier_name: string;
  contact_person: string | null;
  phone_number: string | null;
  email: string | null;
  whatsapp_number: string | null;
  address: string | null;
  notes: string | null;
}

interface InventoryItem {
  id: string;
  name: string;
  unit: string | null;
  quantity: number;
}

interface RestockEntry {
  id: string;
  inventory_item_id: string;
  supplier_id: string | null;
  quantity_purchased: number;
  unit_type: string;
  unit_price: number;
  total_cost: number;
  purchase_date: string;
  invoice_image_url: string | null;
  notes: string | null;
  created_at: string;
  payment_status?: "paid" | "unpaid";
}

const TrendArrow = ({ pct }: { pct: number | null }) => {
  if (pct === null || pct === 0)
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
        <Minus className="h-3 w-3" /> —
      </span>
    );
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${up ? "text-destructive" : "text-emerald-600"}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
};

const Restock = () => {
  const { restaurantId } = useRestaurantContext();
  const { isManager, isOps } = useUserRole();
  const canEdit = isManager || isOps;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [entries, setEntries] = useState<RestockEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [restockOpen, setRestockOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);

  const [form, setForm] = useState({
    inventory_item_id: "",
    supplier_id: "",
    quantity_purchased: "",
    unit_type: "units",
    unit_price: "",
    total_cost: "",
    purchase_date: format(new Date(), "yyyy-MM-dd"),
    notes: "",
    invoice_file: null as File | null,
    payment_status: "paid" as "paid" | "unpaid",
  });

  const [supplierForm, setSupplierForm] = useState({
    supplier_name: "",
    contact_person: "",
    phone_number: "",
    email: "",
    whatsapp_number: "",
    address: "",
    notes: "",
  });

  const load = async () => {
    if (!restaurantId) return;
    setLoading(true);
    const [{ data: s }, { data: i }, { data: e }] = await Promise.all([
      supabase.from("suppliers").select("*").eq("restaurant_id", restaurantId).order("supplier_name"),
      supabase.from("inventory").select("id, name, unit, quantity").eq("restaurant_id", restaurantId).order("name"),
      supabase.from("restock_entries").select("*").eq("restaurant_id", restaurantId).order("purchase_date", { ascending: false }).limit(500),
    ]);
    setSuppliers((s as Supplier[]) || []);
    setItems((i as InventoryItem[]) || []);
    setEntries((e as RestockEntry[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // Auto-calc total/unit price
  const updateForm = (patch: Partial<typeof form>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      const q = parseFloat(next.quantity_purchased);
      const u = parseFloat(next.unit_price);
      const t = parseFloat(next.total_cost);
      if ("quantity_purchased" in patch || "unit_price" in patch) {
        if (!isNaN(q) && !isNaN(u)) next.total_cost = (q * u).toFixed(2);
      } else if ("total_cost" in patch) {
        if (!isNaN(q) && q > 0 && !isNaN(t)) next.unit_price = (t / q).toFixed(2);
      }
      return next;
    });
  };

  const openRestock = (presetItemId?: string) => {
    const item = items.find((i) => i.id === presetItemId);
    setForm({
      inventory_item_id: presetItemId || "",
      supplier_id: "",
      quantity_purchased: "",
      unit_type: item?.unit || "units",
      unit_price: "",
      total_cost: "",
      purchase_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
      invoice_file: null,
      payment_status: "paid",
    });
    setRestockOpen(true);
  };

  const submitRestock = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!restaurantId) return;
    if (!form.inventory_item_id) return toast.error("Choose an inventory item");
    const q = parseFloat(form.quantity_purchased);
    const u = parseFloat(form.unit_price);
    const t = parseFloat(form.total_cost);
    if (!q || q <= 0) return toast.error("Enter a quantity");
    if (isNaN(u) || u < 0) return toast.error("Enter a unit price");
    if (isNaN(t) || t < 0) return toast.error("Enter a total cost");

    setSaving(true);
    try {
      let invoice_url: string | null = null;
      if (form.invoice_file) {
        const ext = form.invoice_file.name.split(".").pop();
        const path = `${restaurantId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("restock-invoices").upload(path, form.invoice_file);
        if (upErr) throw upErr;
        invoice_url = path;
      }

      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("restock_entries").insert({
        restaurant_id: restaurantId,
        inventory_item_id: form.inventory_item_id,
        supplier_id: form.supplier_id || null,
        quantity_purchased: q,
        unit_type: form.unit_type,
        unit_price: u,
        total_cost: t,
        purchase_date: form.purchase_date,
        invoice_image_url: invoice_url,
        notes: form.notes || null,
        created_by: userData.user?.id,
        payment_status: form.payment_status,
        paid_at: form.payment_status === "paid" ? new Date().toISOString() : null,
        marked_paid_by: form.payment_status === "paid" ? userData.user?.id : null,
      } as any);
      if (error) throw error;
      toast.success("Restock saved — expense logged & stock updated");
      setRestockOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to save restock");
    } finally {
      setSaving(false);
    }
  };

  const submitSupplier = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!restaurantId) return;
    if (!supplierForm.supplier_name.trim()) return toast.error("Supplier name required");
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("suppliers")
      .insert({ ...supplierForm, restaurant_id: restaurantId, created_by: userData.user?.id })
      .select()
      .single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Supplier added");
    setSuppliers((prev) => [...prev, data as Supplier].sort((a, b) => a.supplier_name.localeCompare(b.supplier_name)));
    setSupplierForm({ supplier_name: "", contact_person: "", phone_number: "", email: "", whatsapp_number: "", address: "", notes: "" });
    setSupplierOpen(false);
    if (restockOpen) setForm((p) => ({ ...p, supplier_id: data.id }));
  };

  const toggleEntryPaid = async (e: RestockEntry) => {
    const next = e.payment_status === "unpaid" ? "paid" : "unpaid";
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    const { error } = await supabase
      .from("restock_entries")
      .update({
        payment_status: next,
        paid_at: next === "paid" ? new Date().toISOString() : null,
        marked_paid_by: next === "paid" ? uid : null,
      } as any)
      .eq("id", e.id);
    if (error) return toast.error(error.message);
    toast.success(next === "paid" ? "Marked paid" : "Marked unpaid");
    await load();
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("Delete this restock entry? It will reverse the inventory addition and remove the expense.")) return;
    const { error } = await supabase.from("restock_entries").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Restock removed");
    await load();
  };

  const handleScannedReceipt = async (r: ScannedReceipt) => {
    if (!restaurantId) return;
    try {
      let invoice_url: string | null = null;
      if (r.file) {
        const ext = r.file.name.split(".").pop() || "jpg";
        const path = `${restaurantId}/${Date.now()}-receipt.${ext}`;
        const { error: upErr } = await supabase.storage.from("restock-invoices").upload(path, r.file);
        if (!upErr) invoice_url = path;
      }
      const { data: userData } = await supabase.auth.getUser();

      // Auto-create inventory items for any unmapped rows
      const toCreate = r.items.filter((it) => !it.inventory_item_id && it.name.trim());
      const createdMap = new Map<string, string>(); // name -> new id
      if (toCreate.length) {
        const payload = toCreate.map((it) => ({
          restaurant_id: restaurantId,
          name: it.name.trim().slice(0, 200),
          unit: "units",
          quantity: 0,
          status: "available" as const,
        }));
        const { data: created, error: invErr } = await supabase.from("inventory").insert(payload).select("id, name");
        if (invErr) throw invErr;
        (created || []).forEach((c: any) => createdMap.set(c.name, c.id));
        toast.success(`Created ${created?.length || 0} new inventory item${(created?.length || 0) === 1 ? "" : "s"}`);
      }

      const rows = r.items.map((it) => {
        const inventory_item_id = it.inventory_item_id || createdMap.get(it.name.trim().slice(0, 200));
        if (!inventory_item_id) return null;
        const inv = items.find((i) => i.id === inventory_item_id);
        return {
          restaurant_id: restaurantId,
          inventory_item_id,
          supplier_id: r.supplier_id,
          quantity_purchased: it.qty,
          unit_type: inv?.unit || "units",
          unit_price: it.unitPrice,
          total_cost: it.total,
          purchase_date: r.purchase_date,
          invoice_image_url: invoice_url,
          notes: r.notes || `From receipt scan${r.supplier_name ? ` — ${r.supplier_name}` : ""}`,
          created_by: userData.user?.id,
        };
      }).filter(Boolean) as any[];
      const { error } = await supabase.from("restock_entries").insert(rows);
      if (error) throw error;
      toast.success(`Added ${rows.length} item${rows.length === 1 ? "" : "s"} from receipt`);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to save scanned receipt");
      throw err;
    }
  };

  // ===== Analytics =====
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const supplierMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);

  const itemStats = useMemo(() => {
    const map = new Map<
      string,
      { item: InventoryItem | undefined; entries: RestockEntry[]; latest: number; avg: number; min: number; max: number; pctChange: number | null; totalSpend: number; lastDate: string }
    >();
    for (const item of items) {
      const itemEntries = entries.filter((e) => e.inventory_item_id === item.id).sort((a, b) => a.purchase_date.localeCompare(b.purchase_date));
      if (itemEntries.length === 0) continue;
      const prices = itemEntries.map((e) => Number(e.unit_price));
      const latest = prices[prices.length - 1];
      const prev = prices.length > 1 ? prices[prices.length - 2] : null;
      const pctChange = prev && prev > 0 ? ((latest - prev) / prev) * 100 : null;
      map.set(item.id, {
        item,
        entries: itemEntries,
        latest,
        avg: prices.reduce((a, b) => a + b, 0) / prices.length,
        min: Math.min(...prices),
        max: Math.max(...prices),
        pctChange,
        totalSpend: itemEntries.reduce((a, b) => a + Number(b.total_cost), 0),
        lastDate: itemEntries[itemEntries.length - 1].purchase_date,
      });
    }
    return map;
  }, [items, entries]);

  const totalSpend = useMemo(() => entries.reduce((a, b) => a + Number(b.total_cost), 0), [entries]);
  const last30 = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return entries.filter((e) => new Date(e.purchase_date) >= cutoff).reduce((a, b) => a + Number(b.total_cost), 0);
  }, [entries]);

  const topRisers = useMemo(() => {
    return Array.from(itemStats.values())
      .filter((s) => s.pctChange !== null && s.pctChange > 0)
      .sort((a, b) => (b.pctChange || 0) - (a.pctChange || 0))
      .slice(0, 5);
  }, [itemStats]);

  const topSpend = useMemo(
    () => Array.from(itemStats.values()).sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 5),
    [itemStats]
  );

  const monthlyTrend = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const e of entries) {
      const m = e.purchase_date.slice(0, 7);
      buckets.set(m, (buckets.get(m) || 0) + Number(e.total_cost));
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([month, total]) => ({ month, total }));
  }, [entries]);

  const supplierStats = useMemo(() => {
    return suppliers
      .map((sup) => {
        const sEntries = entries.filter((e) => e.supplier_id === sup.id);
        const spend = sEntries.reduce((a, b) => a + Number(b.total_cost), 0);
        const itemCount = new Set(sEntries.map((e) => e.inventory_item_id)).size;
        return { supplier: sup, spend, count: sEntries.length, itemCount, last: sEntries[0]?.purchase_date || null };
      })
      .sort((a, b) => b.spend - a.spend);
  }, [suppliers, entries]);

  // Insights
  const insights = useMemo(() => {
    const list: { icon: any; tone: "warn" | "info" | "good"; text: string }[] = [];
    for (const s of topRisers.slice(0, 3)) {
      list.push({
        icon: TrendingUp,
        tone: "warn",
        text: `${s.item?.name} increased by ${s.pctChange!.toFixed(1)}% vs the previous restock.`,
      });
    }
    // Cheapest supplier per item (top 2 most-purchased items)
    const itemPopularity = Array.from(itemStats.values()).sort((a, b) => b.entries.length - a.entries.length).slice(0, 2);
    for (const s of itemPopularity) {
      const bySupplier = new Map<string, number[]>();
      for (const e of s.entries) {
        if (!e.supplier_id) continue;
        if (!bySupplier.has(e.supplier_id)) bySupplier.set(e.supplier_id, []);
        bySupplier.get(e.supplier_id)!.push(Number(e.unit_price));
      }
      if (bySupplier.size >= 2) {
        let best: { id: string; avg: number } | null = null;
        for (const [id, arr] of bySupplier) {
          const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
          if (!best || avg < best.avg) best = { id, avg };
        }
        if (best) {
          list.push({
            icon: Truck,
            tone: "good",
            text: `${supplierMap.get(best.id)?.supplier_name} is consistently cheapest for ${s.item?.name} (avg ${formatPrice(best.avg)}).`,
          });
        }
      }
      // restock frequency
      if (s.entries.length >= 3) {
        const dates = s.entries.map((e) => parseISO(e.purchase_date));
        let total = 0;
        for (let i = 1; i < dates.length; i++) total += differenceInDays(dates[i], dates[i - 1]);
        const avgDays = Math.round(total / (dates.length - 1));
        if (avgDays > 0)
          list.push({
            icon: Receipt,
            tone: "info",
            text: `You restock ${s.item?.name} every ${avgDays} day${avgDays === 1 ? "" : "s"} on average.`,
          });
      }
    }
    return list.slice(0, 6);
  }, [topRisers, itemStats, supplierMap]);

  const detailStat = detailItemId ? itemStats.get(detailItemId) : null;
  const detailHistory = useMemo(() => {
    if (!detailStat) return [] as { date: string; price: number; supplier: string }[];
    return detailStat.entries.map((e) => ({
      date: e.purchase_date,
      price: Number(e.unit_price),
      supplier: e.supplier_id ? supplierMap.get(e.supplier_id)?.supplier_name || "—" : "—",
    }));
  }, [detailStat, supplierMap]);

  return (
    <div className="container max-w-7xl py-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Supply Intelligence</h1>
          <p className="text-sm text-muted-foreground">Track restocks, supplier costs, and price trends.</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSupplierOpen(true)}>
              <Truck className="h-4 w-4 mr-2" /> New Supplier
            </Button>
            <Button variant="outline" onClick={() => setScannerOpen(true)}>
              <ScanLine className="h-4 w-4 mr-2" /> Scan Receipt
            </Button>
            <Button onClick={() => openRestock()}>
              <Plus className="h-4 w-4 mr-2" /> Log Restock
            </Button>
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total restock spend</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatPriceCompact(totalSpend)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Last 30 days</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatPriceCompact(last30)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Active suppliers</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold">{suppliers.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Tracked items</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold">{itemStats.size}</p></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview"><BarChart3 className="h-4 w-4 mr-2" />Overview</TabsTrigger>
          <TabsTrigger value="items"><Package className="h-4 w-4 mr-2" />Items</TabsTrigger>
          <TabsTrigger value="suppliers"><Truck className="h-4 w-4 mr-2" />Suppliers</TabsTrigger>
          <TabsTrigger value="history"><Receipt className="h-4 w-4 mr-2" />History</TabsTrigger>
          <TabsTrigger value="bills"><FileText className="h-4 w-4 mr-2" />Bills</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Monthly procurement</CardTitle>
                <CardDescription>Spend per month (last 12)</CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                {monthlyTrend.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="month" fontSize={11} />
                      <YAxis fontSize={11} tickFormatter={(v) => formatPriceCompact(v)} />
                      <Tooltip formatter={(v: number) => formatPrice(v)} />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />Insights</CardTitle>
                <CardDescription>Smart procurement signals</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {insights.length === 0 && <p className="text-sm text-muted-foreground">Log a few restocks to unlock insights.</p>}
                {insights.map((ins, i) => {
                  const Icon = ins.icon;
                  const toneCls = ins.tone === "warn" ? "border-destructive/30 bg-destructive/5" : ins.tone === "good" ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-muted/30";
                  return (
                    <div key={i} className={`rounded-md border p-2.5 text-sm flex gap-2 ${toneCls}`}>
                      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                      <span>{ins.text}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fastest rising costs</CardTitle>
                <CardDescription>Largest % increase vs previous restock</CardDescription>
              </CardHeader>
              <CardContent>
                {topRisers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No price increases recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {topRisers.map((s) => (
                      <button key={s.item?.id} onClick={() => setDetailItemId(s.item?.id || null)} className="w-full flex items-center justify-between p-2 rounded-md hover:bg-muted/50 text-left">
                        <div>
                          <p className="text-sm font-medium">{s.item?.name}</p>
                          <p className="text-xs text-muted-foreground">Now {formatPrice(s.latest)} / {s.entries[s.entries.length - 1].unit_type}</p>
                        </div>
                        <TrendArrow pct={s.pctChange} />
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Most expensive items</CardTitle>
                <CardDescription>Total spend by item</CardDescription>
              </CardHeader>
              <CardContent>
                {topSpend.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No restocks yet.</p>
                ) : (
                  <div className="space-y-2">
                    {topSpend.map((s) => (
                      <button key={s.item?.id} onClick={() => setDetailItemId(s.item?.id || null)} className="w-full flex items-center justify-between p-2 rounded-md hover:bg-muted/50 text-left">
                        <div>
                          <p className="text-sm font-medium">{s.item?.name}</p>
                          <p className="text-xs text-muted-foreground">{s.entries.length} restock{s.entries.length === 1 ? "" : "s"}</p>
                        </div>
                        <span className="text-sm font-mono">{formatPrice(s.totalSpend)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ITEMS */}
        <TabsContent value="items">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Item price intelligence</CardTitle>
              <CardDescription>Click an item to see its full price history</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Latest</TableHead>
                      <TableHead className="text-right">Avg</TableHead>
                      <TableHead className="text-right">Min</TableHead>
                      <TableHead className="text-right">Max</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                      <TableHead className="text-right">Restocks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemStats.size === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No restock data yet</TableCell></TableRow>
                    )}
                    {Array.from(itemStats.values()).map((s) => (
                      <TableRow key={s.item?.id} className="cursor-pointer" onClick={() => setDetailItemId(s.item?.id || null)}>
                        <TableCell className="font-medium">{s.item?.name}</TableCell>
                        <TableCell className="text-right font-mono">{formatPrice(s.latest)}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{formatPrice(s.avg)}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{formatPrice(s.min)}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{formatPrice(s.max)}</TableCell>
                        <TableCell className="text-right"><TrendArrow pct={s.pctChange} /></TableCell>
                        <TableCell className="text-right">{s.entries.length}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SUPPLIERS */}
        <TabsContent value="suppliers">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Suppliers</CardTitle>
                <CardDescription>Ranked by total spend</CardDescription>
              </div>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => setSupplierOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead className="text-right">Purchases</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                      <TableHead>Last</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supplierStats.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No suppliers yet</TableCell></TableRow>
                    )}
                    {supplierStats.map(({ supplier, spend, count, itemCount, last }) => (
                      <TableRow key={supplier.id}>
                        <TableCell>
                          <p className="font-medium">{supplier.supplier_name}</p>
                          {supplier.contact_person && <p className="text-xs text-muted-foreground">{supplier.contact_person}</p>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {supplier.phone_number || supplier.whatsapp_number || supplier.email || "—"}
                        </TableCell>
                        <TableCell className="text-right">{count}</TableCell>
                        <TableCell className="text-right">{itemCount}</TableCell>
                        <TableCell className="text-right font-mono">{formatPrice(spend)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{last ? format(parseISO(last), "MMM d, yyyy") : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* HISTORY */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent restocks</CardTitle>
              <CardDescription>Latest purchase activity</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
                    {!loading && entries.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No restocks logged</TableCell></TableRow>
                    )}
                    {entries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">{format(parseISO(e.purchase_date), "MMM d, yyyy")}</TableCell>
                        <TableCell className="font-medium">{itemMap.get(e.inventory_item_id)?.name || "—"}</TableCell>
                        <TableCell className="text-sm">{e.supplier_id ? supplierMap.get(e.supplier_id)?.supplier_name || "—" : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-right">{e.quantity_purchased} {e.unit_type}</TableCell>
                        <TableCell className="text-right font-mono">{formatPrice(Number(e.unit_price))}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{formatPrice(Number(e.total_cost))}</TableCell>
                        <TableCell>
                          <button type="button" onClick={() => canEdit && toggleEntryPaid(e)} disabled={!canEdit} className="focus:outline-none">
                            {e.payment_status === "unpaid" ? (
                              <Badge className="bg-amber-500 hover:bg-amber-600 text-white border-0 gap-1"><Clock className="h-3 w-3" />Unpaid</Badge>
                            ) : (
                              <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 gap-1"><CheckCircle2 className="h-3 w-3" />Paid</Badge>
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {e.invoice_image_url && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={async () => {
                                  const raw = e.invoice_image_url!;
                                  let path = raw;
                                  // Backwards-compat: extract path from any legacy full URL
                                  const marker = "/restock-invoices/";
                                  const idx = raw.indexOf(marker);
                                  if (idx >= 0) path = raw.substring(idx + marker.length);
                                  const { data, error } = await supabase.storage
                                    .from("restock-invoices")
                                    .createSignedUrl(path, 60);
                                  if (error || !data?.signedUrl) {
                                    toast.error("Invoice not available");
                                    return;
                                  }
                                  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
                                }}
                              >
                                <ImageIcon className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canEdit && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteEntry(e.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bills">
          <BillsSection suppliers={suppliers} />
        </TabsContent>
      </Tabs>

      {/* RESTOCK DIALOG */}
      <Dialog open={restockOpen} onOpenChange={setRestockOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log a restock</DialogTitle>
            <DialogDescription>This will deduct from business funds (as an expense) and add to inventory.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitRestock} className="space-y-3">
            <div>
              <Label>Inventory item *</Label>
              <Select value={form.inventory_item_id} onValueChange={(v) => {
                const it = items.find((i) => i.id === v);
                updateForm({ inventory_item_id: v, unit_type: it?.unit || "units" });
              }}>
                <SelectTrigger><SelectValue placeholder="Choose item" /></SelectTrigger>
                <SelectContent>
                  {items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Supplier</Label>
              <div className="flex gap-2">
                <Select value={form.supplier_id} onValueChange={(v) => setForm((p) => ({ ...p, supplier_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.supplier_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" onClick={() => setSupplierOpen(true)}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantity *</Label>
                <Input type="number" inputMode="decimal" step="0.01" value={form.quantity_purchased} onChange={(e) => updateForm({ quantity_purchased: e.target.value })} />
              </div>
              <div>
                <Label>Unit</Label>
                <Input value={form.unit_type} onChange={(e) => setForm((p) => ({ ...p, unit_type: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Unit price (₺) *</Label>
                <Input type="number" inputMode="decimal" step="0.01" value={form.unit_price} onChange={(e) => updateForm({ unit_price: e.target.value })} />
              </div>
              <div>
                <Label>Total cost (₺) *</Label>
                <Input type="number" inputMode="decimal" step="0.01" value={form.total_cost} onChange={(e) => updateForm({ total_cost: e.target.value })} />
              </div>
            </div>

            <div>
              <Label>Purchase date</Label>
              <Input type="date" value={form.purchase_date} onChange={(e) => setForm((p) => ({ ...p, purchase_date: e.target.value }))} />
            </div>

            <div>
              <Label>Invoice image (optional)</Label>
              <Input type="file" accept="image/*" onChange={(e) => setForm((p) => ({ ...p, invoice_file: e.target.files?.[0] || null }))} />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRestockOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save restock"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* SUPPLIER DIALOG */}
      <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New supplier</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitSupplier} className="space-y-3">
            <div><Label>Supplier name *</Label><Input value={supplierForm.supplier_name} onChange={(e) => setSupplierForm((p) => ({ ...p, supplier_name: e.target.value }))} /></div>
            <div><Label>Contact person</Label><Input value={supplierForm.contact_person} onChange={(e) => setSupplierForm((p) => ({ ...p, contact_person: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Phone</Label><Input value={supplierForm.phone_number} onChange={(e) => setSupplierForm((p) => ({ ...p, phone_number: e.target.value }))} /></div>
              <div><Label>WhatsApp</Label><Input value={supplierForm.whatsapp_number} onChange={(e) => setSupplierForm((p) => ({ ...p, whatsapp_number: e.target.value }))} /></div>
            </div>
            <div><Label>Email</Label><Input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm((p) => ({ ...p, email: e.target.value }))} /></div>
            <div><Label>Address</Label><Input value={supplierForm.address} onChange={(e) => setSupplierForm((p) => ({ ...p, address: e.target.value }))} /></div>
            <div><Label>Notes</Label><Textarea rows={2} value={supplierForm.notes} onChange={(e) => setSupplierForm((p) => ({ ...p, notes: e.target.value }))} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSupplierOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Add supplier"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ITEM DETAIL DIALOG */}
      <Dialog open={!!detailItemId} onOpenChange={(o) => !o && setDetailItemId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailStat?.item?.name}</DialogTitle>
            <DialogDescription>Price history & supplier comparison</DialogDescription>
          </DialogHeader>
          {detailStat && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-md border p-2"><p className="text-xs text-muted-foreground">Latest</p><p className="font-semibold">{formatPrice(detailStat.latest)}</p></div>
                <div className="rounded-md border p-2"><p className="text-xs text-muted-foreground">Average</p><p className="font-semibold">{formatPrice(detailStat.avg)}</p></div>
                <div className="rounded-md border p-2"><p className="text-xs text-muted-foreground">Lowest</p><p className="font-semibold text-emerald-600">{formatPrice(detailStat.min)}</p></div>
                <div className="rounded-md border p-2"><p className="text-xs text-muted-foreground">Highest</p><p className="font-semibold text-destructive">{formatPrice(detailStat.max)}</p></div>
              </div>

              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={detailHistory}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => formatPriceCompact(v)} />
                    <Tooltip formatter={(v: number) => formatPrice(v)} />
                    <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">Supplier comparison</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Purchases</TableHead>
                      <TableHead className="text-right">Avg unit price</TableHead>
                      <TableHead className="text-right">Last price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from(
                      detailStat.entries.reduce((m, e) => {
                        const key = e.supplier_id || "none";
                        if (!m.has(key)) m.set(key, [] as RestockEntry[]);
                        m.get(key)!.push(e);
                        return m;
                      }, new Map<string, RestockEntry[]>())
                    ).map(([sid, arr]) => {
                      const prices = arr.map((a) => Number(a.unit_price));
                      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
                      const last = arr.sort((a, b) => b.purchase_date.localeCompare(a.purchase_date))[0];
                      return (
                        <TableRow key={sid}>
                          <TableCell>{sid === "none" ? <span className="text-muted-foreground">No supplier</span> : supplierMap.get(sid)?.supplier_name || "—"}</TableCell>
                          <TableCell className="text-right">{arr.length}</TableCell>
                          <TableCell className="text-right font-mono">{formatPrice(avg)}</TableCell>
                          <TableCell className="text-right font-mono">{formatPrice(Number(last.unit_price))}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">Purchase timeline</p>
                <div className="space-y-1">
                  {detailStat.entries.slice().reverse().slice(0, 10).map((e, idx, arr) => {
                    const prev = arr[idx + 1];
                    const pct = prev && Number(prev.unit_price) > 0 ? ((Number(e.unit_price) - Number(prev.unit_price)) / Number(prev.unit_price)) * 100 : null;
                    return (
                      <div key={e.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                        <div>
                          <span className="font-mono">{format(parseISO(e.purchase_date), "MMM d, yyyy")}</span>
                          <span className="text-muted-foreground ml-2">· {e.supplier_id ? supplierMap.get(e.supplier_id)?.supplier_name : "—"}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{e.quantity_purchased} {e.unit_type}</Badge>
                          <span className="font-mono font-semibold">{formatPrice(Number(e.unit_price))}</span>
                          <TrendArrow pct={pct} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReceiptScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        inventoryItems={items}
        suppliers={suppliers}
        onConfirm={handleScannedReceipt}
      />
    </div>
  );
};

export default Restock;
