import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, ShoppingBasket, Check, RotateCcw } from "lucide-react";
import { format } from "date-fns";

type Status = "pending" | "purchased" | "cancelled";

interface BuyItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  notes: string | null;
  status: Status;
  for_date: string;
  inventory_item_id: string | null;
  created_by: string;
  purchased_by: string | null;
  purchased_at: string | null;
  created_at: string;
}

interface InventoryRow {
  id: string;
  name: string;
  unit: string | null;
  status: string;
}

const BuyList = () => {
  const { restaurantId } = useRestaurantContext();
  const [items, setItems] = useState<BuyItem[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"today" | "all">("today");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    inventory_item_id: "",
    name: "",
    quantity: "1",
    unit: "units",
    notes: "",
  });

  const today = format(new Date(), "yyyy-MM-dd");

  const load = async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const [bRes, iRes] = await Promise.all([
        supabase
          .from("buy_list_items")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false }),
        supabase
          .from("inventory")
          .select("id, name, unit, status")
          .eq("restaurant_id", restaurantId)
          .order("name"),
      ]);
      if (bRes.error) throw bRes.error;
      if (iRes.error) throw iRes.error;
      setItems((bRes.data || []) as BuyItem[]);
      setInventory((iRes.data || []) as InventoryRow[]);
    } catch (e: any) {
      toast.error(e.message || "Failed to load buy list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (!restaurantId) return;
    const ch = supabase
      .channel(`buy-list-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "buy_list_items", filter: `restaurant_id=eq.${restaurantId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const resetForm = () => setForm({ inventory_item_id: "", name: "", quantity: "1", unit: "units", notes: "" });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId) return;
    const name = form.name.trim();
    if (!name) {
      toast.error("Item name is required");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("buy_list_items").insert({
        restaurant_id: restaurantId,
        inventory_item_id: form.inventory_item_id || null,
        name: name.slice(0, 200),
        quantity: parseFloat(form.quantity) || 1,
        unit: form.unit.slice(0, 50) || "units",
        notes: form.notes.trim().slice(0, 500) || null,
        created_by: user.id,
        for_date: today,
      });
      if (error) throw error;
      toast.success("Added to buy list");
      resetForm();
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to add");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: string, status: Status) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const patch: any = { status };
      if (status === "purchased") {
        patch.purchased_by = user?.id ?? null;
        patch.purchased_at = new Date().toISOString();
      } else {
        patch.purchased_by = null;
        patch.purchased_at = null;
      }
      const { error } = await supabase.from("buy_list_items").update(patch).eq("id", id);
      if (error) throw error;
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this item from the buy list?")) return;
    try {
      const { error } = await supabase.from("buy_list_items").delete().eq("id", id);
      if (error) throw error;
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  };

  const onPickInventory = (id: string) => {
    if (id === "__custom__") {
      setForm((f) => ({ ...f, inventory_item_id: "" }));
      return;
    }
    const inv = inventory.find((i) => i.id === id);
    if (!inv) return;
    setForm((f) => ({
      ...f,
      inventory_item_id: id,
      name: inv.name,
      unit: inv.unit || f.unit || "units",
    }));
  };

  const visible = useMemo(() => {
    if (view === "today") return items.filter((i) => i.for_date === today);
    return items;
  }, [items, view, today]);

  const pending = visible.filter((i) => i.status === "pending");
  const done = visible.filter((i) => i.status !== "pending");

  // Suggest low-stock items not already on today's pending list
  const suggestions = useMemo(() => {
    const onListIds = new Set(
      items
        .filter((i) => i.for_date === today && i.status === "pending" && i.inventory_item_id)
        .map((i) => i.inventory_item_id as string),
    );
    return inventory.filter((i) => (i.status === "almost_finished" || i.status === "finished") && !onListIds.has(i.id));
  }, [inventory, items, today]);

  const quickAddSuggestion = async (inv: InventoryRow) => {
    if (!restaurantId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("buy_list_items").insert({
        restaurant_id: restaurantId,
        inventory_item_id: inv.id,
        name: inv.name,
        quantity: 1,
        unit: inv.unit || "units",
        created_by: user.id,
        for_date: today,
      });
      if (error) throw error;
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to add");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2">
            <ShoppingBasket className="h-7 w-7" /> Buy List
          </h2>
          <p className="text-muted-foreground mt-1">What needs to be purchased today.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Item</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to Buy List</DialogTitle>
              <DialogDescription>Pick an inventory item or enter a custom one.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <Label>From inventory (optional)</Label>
                <Select value={form.inventory_item_id || "__custom__"} onValueChange={onPickInventory}>
                  <SelectTrigger><SelectValue placeholder="Custom item" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__custom__">— Custom item —</SelectItem>
                    {inventory.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bl-name">Item *</Label>
                <Input id="bl-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.slice(0, 200) })} required maxLength={200} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="bl-qty">Quantity</Label>
                  <Input id="bl-qty" type="number" step="0.01" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bl-unit">Unit</Label>
                  <Input id="bl-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value.slice(0, 50) })} maxLength={50} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bl-notes">Notes</Label>
                <Textarea id="bl-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value.slice(0, 500) })} placeholder="Brand, supplier, urgency..." maxLength={500} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? "Adding..." : "Add"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as any)}>
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {suggestions.length > 0 && view === "today" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Suggested from inventory</CardTitle>
            <CardDescription>Items marked almost finished or finished.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <Button key={s.id} size="sm" variant="outline" onClick={() => quickAddSuggestion(s)}>
                  <Plus className="h-3 w-3 mr-1" />{s.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-center text-muted-foreground">Loading...</p>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nothing on the buy list {view === "today" ? "today" : "yet"}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">To buy ({pending.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pending.map((it) => (
                  <Row key={it.id} item={it} onToggle={setStatus} onRemove={remove} />
                ))}
              </CardContent>
            </Card>
          )}

          {done.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Completed</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {done.map((it) => (
                  <Row key={it.id} item={it} onToggle={setStatus} onRemove={remove} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

function Row({
  item,
  onToggle,
  onRemove,
}: {
  item: BuyItem;
  onToggle: (id: string, status: Status) => void;
  onRemove: (id: string) => void;
}) {
  const isDone = item.status === "purchased";
  const isCancelled = item.status === "cancelled";
  return (
    <div className="flex items-start gap-3 rounded-md border bg-muted/20 p-3">
      <Checkbox
        checked={isDone}
        onCheckedChange={(v) => onToggle(item.id, v ? "purchased" : "pending")}
        className="mt-1"
        aria-label="Mark purchased"
      />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-sm font-medium ${isDone || isCancelled ? "line-through text-muted-foreground" : ""}`}>{item.name}</p>
          <Badge variant="outline" className="text-xs">{item.quantity} {item.unit}</Badge>
          {isCancelled && <Badge variant="secondary" className="text-xs">Cancelled</Badge>}
        </div>
        {item.notes && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{item.notes}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          {format(new Date(item.created_at), "MMM d, h:mm a")}
          {item.purchased_at ? ` · purchased ${format(new Date(item.purchased_at), "h:mm a")}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {item.status === "pending" ? (
          <Button variant="ghost" size="sm" onClick={() => onToggle(item.id, "cancelled")}>Cancel</Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onToggle(item.id, "pending")} aria-label="Reopen">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onRemove(item.id)} aria-label="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default BuyList;
