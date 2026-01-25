import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";

type InventoryStatus = "available" | "almost_finished" | "finished";

interface InventoryItem {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  status: InventoryStatus;
  restaurant_id: string;
  created_at: string;
  updated_at: string;
}

const statusLabels: Record<InventoryStatus, string> = {
  available: "Available",
  almost_finished: "Almost Finished",
  finished: "Finished",
};

const statusColors: Record<InventoryStatus, "default" | "secondary" | "destructive"> = {
  available: "default",
  almost_finished: "secondary",
  finished: "destructive",
};

const Inventory = () => {
  const { restaurantId, loading: restaurantLoading } = useRestaurantContext();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    quantity: "",
    unit: "units",
    status: "available" as InventoryStatus,
  });

  useEffect(() => {
    if (restaurantLoading) return;
    if (!restaurantId) return;
    fetchInventory(restaurantId);
  }, [restaurantLoading, restaurantId]);

  const fetchInventory = async (rid: string) => {
    try {
      const { data, error } = await supabase
        .from("inventory")
        .select("*")
        .eq("restaurant_id", rid)
        .order("name");

      if (error) throw error;
      setItems(data || []);
    } catch (error: any) {
      toast.error("Failed to load inventory");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!restaurantId) throw new Error("Restaurant not selected");

      const itemData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        quantity: parseFloat(formData.quantity) || 0,
        unit: formData.unit,
        status: formData.status,
        restaurant_id: restaurantId,
      };

      if (!itemData.name) {
        toast.error("Name is required");
        setLoading(false);
        return;
      }

      if (editingItem) {
        const { error } = await supabase
          .from("inventory")
          .update(itemData)
          .eq("id", editingItem.id);
        if (error) throw error;
        toast.success("Inventory item updated!");
      } else {
        const { error } = await supabase.from("inventory").insert([itemData]);
        if (error) throw error;
        toast.success("Inventory item added!");
      }

      setDialogOpen(false);
      resetForm();
      if (restaurantId) fetchInventory(restaurantId);
    } catch (error: any) {
      toast.error(error.message || "Failed to save inventory item");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      const { error } = await supabase.from("inventory").delete().eq("id", id);
      if (error) throw error;
      toast.success("Item deleted");
      if (restaurantId) fetchInventory(restaurantId);
    } catch (error: any) {
      toast.error("Failed to delete item");
    }
  };

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description || "",
      quantity: item.quantity.toString(),
      unit: item.unit,
      status: item.status,
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      quantity: "",
      unit: "units",
      status: "available",
    });
    setEditingItem(null);
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="py-2">
            <h2 className="text-3xl font-bold">Inventory</h2>
            <p className="text-muted-foreground mt-1">Manage your inventory items and their status</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingItem ? "Edit" : "Add"} Inventory Item</DialogTitle>
                <DialogDescription>
                  {editingItem ? "Update the item details" : "Add a new item to your inventory"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Item Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value.slice(0, 200) })}
                    required
                    maxLength={200}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unit</Label>
                    <Input
                      id="unit"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value.slice(0, 50) })}
                      placeholder="e.g., kg, liters, boxes"
                      maxLength={50}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status *</Label>
                  <Select value={formData.status} onValueChange={(value: InventoryStatus) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="almost_finished">Almost Finished</SelectItem>
                      <SelectItem value="finished">Finished</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value.slice(0, 500) })}
                    placeholder="Optional description"
                    maxLength={500}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={loading} className="flex-1">
                    {loading ? "Saving..." : editingItem ? "Update" : "Add"} Item
                  </Button>
                  <Button type="button" variant="outline" onClick={() => {
                    setDialogOpen(false);
                    resetForm();
                  }}>
                    Cancel
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading && <p className="text-center text-muted-foreground">Loading inventory...</p>}

        {!loading && items.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">No inventory items yet</p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Item
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && items.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{item.name}</CardTitle>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge variant={statusColors[item.status]}>
                          {statusLabels[item.status]}
                        </Badge>
                        <Badge variant="outline">
                          {item.quantity} {item.unit}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {item.description && (
                    <CardDescription className="mt-2">{item.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(item)} className="flex-1">
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(item.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Inventory;
