import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Share2, Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatPrice } from "@/lib/currency";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { menuItemSchema, validateInput } from "@/lib/validations";

interface MenuItem {
  id: string;
  name: string;
  category: string | null;
  base_price: number;
  per_unit_price: number | null;
  description: string | null;
  is_available: boolean;
  pricing_unit: string;
  currency: string;
  is_inventory_item: boolean;
  stock_qty: number;
}
const MenuManagement = () => {
  const { restaurantId, loading: restaurantLoading } = useRestaurantContext();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    base_price: "",
    per_unit_price: "",
    description: "",
    pricing_unit: "per piece",
    currency: "TRY",
    is_inventory_item: false,
    stock_qty: ""
  });
  useEffect(() => {
    if (restaurantLoading) return;
    if (!restaurantId) return;
    fetchMenuItems(restaurantId);
    fetchSettings(restaurantId);
  }, [restaurantLoading, restaurantId]);

  const fetchSettings = async (rid: string) => {
    const {
      data
    } = await supabase.from("restaurant_settings").select("currency").eq("restaurant_id", rid).maybeSingle();
    if (data) {
      setFormData(prev => ({
        ...prev,
        currency: data.currency
      }));
    }
  };

  const fetchMenuItems = async (rid: string) => {
    try {
      const {
        data,
        error
      } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", rid)
        .order("category", { ascending: true })
        .order("name", { ascending: true });
      
      if (error) throw error;
      setMenuItems(data || []);
    } catch (error: any) {
      toast.error("Failed to load menu items");
    } finally {
      setLoading(false);
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      
      // Validate menu item data
      const basePrice = parseFloat(formData.base_price);
      const perUnitPrice = formData.per_unit_price ? parseFloat(formData.per_unit_price) : null;
      
      if (isNaN(basePrice) || basePrice <= 0) {
        toast.error("Base price must be a positive number");
        setLoading(false);
        return;
      }
      
      if (perUnitPrice !== null && (isNaN(perUnitPrice) || perUnitPrice <= 0)) {
        toast.error("Per unit price must be a positive number");
        setLoading(false);
        return;
      }
      
      const validation = validateInput(menuItemSchema, {
        name: formData.name,
        category: formData.category || null,
        description: formData.description || null,
        base_price: basePrice,
        per_unit_price: perUnitPrice,
        pricing_unit: formData.pricing_unit,
        currency: "TRY" as const,
      });
      
      if (!validation.success) {
        toast.error(validation.error);
        setLoading(false);
        return;
      }
      
      const itemData = {
        name: validation.data.name,
        category: validation.data.category,
        base_price: validation.data.base_price,
        per_unit_price: validation.data.per_unit_price,
        description: validation.data.description,
        pricing_unit: validation.data.pricing_unit,
        currency: validation.data.currency,
        is_inventory_item: formData.is_inventory_item,
        stock_qty: formData.is_inventory_item ? parseInt(formData.stock_qty) || 0 : 0
      };
      if (editingItem) {
        const {
          error
        } = await supabase.from("menu_items").update(itemData).eq("id", editingItem.id);
        if (error) throw error;
        toast.success("Menu item updated!");
      } else {
        if (!restaurantId) throw new Error("Restaurant not selected");
        const {
          error
        } = await supabase.from("menu_items").insert([{
          ...itemData,
          staff_id: user.id,
          restaurant_id: restaurantId
        }]);
        if (error) throw error;
        toast.success("Menu item added!");
      }
      setDialogOpen(false);
      resetForm();
      if (restaurantId) fetchMenuItems(restaurantId);
    } catch (error: any) {
      toast.error(error.message || "Failed to save menu item");
    } finally {
      setLoading(false);
    }
  };
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      const {
        error
      } = await supabase.from("menu_items").delete().eq("id", id);
      if (error) throw error;
      toast.success("Item deleted");
      if (restaurantId) fetchMenuItems(restaurantId);
    } catch (error: any) {
      toast.error("Failed to delete item");
    }
  };

  const handleToggleAvailability = async (item: MenuItem) => {
    try {
      const { error } = await supabase
        .from("menu_items")
        .update({ is_available: !item.is_available })
        .eq("id", item.id);
      if (error) throw error;
      toast.success(`${item.name} is now ${!item.is_available ? 'available' : 'unavailable'}`);
      if (restaurantId) fetchMenuItems(restaurantId);
    } catch (error: any) {
      toast.error("Failed to update availability");
    }
  };
  const handleEdit = (item: MenuItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      category: item.category || "",
      base_price: item.base_price.toString(),
      per_unit_price: item.per_unit_price?.toString() || "",
      description: item.description || "",
      pricing_unit: item.pricing_unit || "per piece",
      currency: "TRY",
      is_inventory_item: item.is_inventory_item,
      stock_qty: item.stock_qty?.toString() || ""
    });
    setDialogOpen(true);
  };
  const resetForm = () => {
    setFormData({
      name: "",
      category: "",
      base_price: "",
      per_unit_price: "",
      description: "",
      pricing_unit: "per piece",
      currency: "TRY",
      is_inventory_item: false,
      stock_qty: ""
    });
    setEditingItem(null);
  };
  const groupedItems = menuItems.reduce((acc, item) => {
    const category = item.category || "Uncategorized";
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  const availableItems = menuItems.filter(item => item.is_available);
  const groupedAvailable = availableItems.reduce((acc, item) => {
    const category = item.category || "Uncategorized";
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  const generateMenuText = () => {
    let text = "📋 MENU\n\n";
    Object.entries(groupedAvailable).forEach(([category, items]) => {
      text += `━━━ ${category.toUpperCase()} ━━━\n`;
      items.forEach(item => {
        text += `• ${item.name} - ${formatPrice(item.base_price, item.currency)}`;
        if (item.per_unit_price) {
          text += ` (+${formatPrice(item.per_unit_price, item.currency)}/${item.pricing_unit})`;
        }
        text += "\n";
        if (item.description) {
          text += `  ${item.description}\n`;
        }
      });
      text += "\n";
    });
    return text.trim();
  };

  const handleCopyMenu = async () => {
    const text = generateMenuText();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Menu copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };
  return <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="py-[10px]">
            <h2 className="text-3xl font-bold">Menu Management</h2>
            <p className="text-muted-foreground my-[10px]">Add and manage your menu items</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={open => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShareDialogOpen(true)} disabled={availableItems.length === 0}>
                <Share2 className="h-4 w-4 mr-2" />
                Share Menu
              </Button>
              <DialogTrigger asChild>
                <Button className="bg-[#435663]">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </DialogTrigger>
            </div>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingItem ? "Edit" : "Add"} Menu Item</DialogTitle>
                <DialogDescription>
                  {editingItem ? "Update the item details" : "Add a new item to your menu"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Item Name *</Label>
                  <Input 
                    id="name" 
                    value={formData.name} 
                    onChange={e => setFormData({
                      ...formData,
                      name: e.target.value.slice(0, 200)
                    })} 
                    required 
                    maxLength={200}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Input 
                    id="category" 
                    value={formData.category} 
                    onChange={e => setFormData({
                      ...formData,
                      category: e.target.value.slice(0, 100)
                    })} 
                    placeholder="e.g., Mains, Drinks, Desserts" 
                    maxLength={100}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="base_price">Base Price *</Label>
                    <Input 
                      id="base_price" 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      max="999999.99"
                      value={formData.base_price} 
                      onChange={e => setFormData({
                        ...formData,
                        base_price: e.target.value
                      })} 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="per_unit_price">Per Unit Price (Optional)</Label>
                    <Input 
                      id="per_unit_price" 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      max="999999.99"
                      value={formData.per_unit_price} 
                      onChange={e => setFormData({
                        ...formData,
                        per_unit_price: e.target.value
                      })} 
                      placeholder="Add-on price" 
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pricing_unit">Pricing Unit *</Label>
                    <Select value={formData.pricing_unit} onValueChange={value => setFormData({
                    ...formData,
                    pricing_unit: value
                  })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="per piece">Per Piece</SelectItem>
                        <SelectItem value="per scoop">Per Scoop</SelectItem>
                        <SelectItem value="per serving">Per Serving</SelectItem>
                        <SelectItem value="per bowl">Per Bowl</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Currency is always TRY, read-only */}
                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <p className="text-sm text-muted-foreground border rounded-md p-2">₺ Turkish Lira (TRY)</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea 
                    id="description" 
                    value={formData.description} 
                    onChange={e => setFormData({
                      ...formData,
                      description: e.target.value.slice(0, 1000)
                    })} 
                    placeholder="Brief description of the item" 
                    maxLength={1000}
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

          <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
            <DialogContent className="max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>Share Menu</DialogTitle>
                <DialogDescription>
                  Copy the menu text below to share via WhatsApp, SMS, or any other platform.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Textarea 
                  value={generateMenuText()} 
                  readOnly 
                  className="min-h-[300px] font-mono text-sm"
                />
                <Button onClick={handleCopyMenu} className="w-full">
                  {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copied ? "Copied!" : "Copy to Clipboard"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading && <p className="text-center text-muted-foreground">Loading menu...</p>}

        {!loading && menuItems.length === 0 && <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">No menu items yet</p>
              <Button onClick={() => setDialogOpen(true)} className="bg-[435663] bg-[#435663]">
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Item
              </Button>
            </CardContent>
          </Card>}

        {!loading && menuItems.length > 0 && <div className="space-y-6">
            {Object.entries(groupedItems).map(([category, items]) => <div key={category}>
                <h3 className="text-xl font-semibold mb-3">{category}</h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {items.map(item => <Card key={item.id} className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg">{item.name}</CardTitle>
                            <div className="flex flex-col gap-2 mt-1">
                              <Badge variant="secondary" className="font-bold w-fit">
                                {formatPrice(item.base_price, item.currency)}
                              </Badge>
                              {item.per_unit_price && <Badge variant="outline" className="text-xs w-fit">
                                  +{formatPrice(item.per_unit_price, item.currency)} / {item.pricing_unit}
                                </Badge>}
                            </div>
                          </div>
                        </div>
                        {item.description && <CardDescription className="mt-2">{item.description}</CardDescription>}
                        <div className="flex items-center gap-2 mt-3">
                          <Switch
                            checked={item.is_available}
                            onCheckedChange={() => handleToggleAvailability(item)}
                            id={`available-${item.id}`}
                          />
                          <Label htmlFor={`available-${item.id}`} className="text-sm font-normal">
                            {item.is_available ? 'Available' : 'Unavailable'}
                          </Label>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(item)} className="flex-1">
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDelete(item.id)} className="text-destructive hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>)}
                </div>
              </div>)}
          </div>}
      </div>
    </Layout>;
};
export default MenuManagement;