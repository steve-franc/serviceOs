import { useState, useMemo, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Share2, Copy, Check, Search, ChevronDown, ChevronRight, Upload, X, ExternalLink, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatPrice } from "@/lib/currency";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { useMenuItems, useInvalidateMenuItems, useRestaurantSettings } from "@/hooks/useQueries";
import { menuItemSchema, validateInput } from "@/lib/validations";
import { ServiceFormSection, DEFAULT_SERVICE_FIELDS, AvailabilityWindow, ServiceFields } from "@/components/ServiceFormSection";
import { isServiceBusiness } from "@/lib/business-types";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ManageUnitsDialog } from "@/components/ManageUnitsDialog";

interface MenuItem {
  id: string;
  name: string;
  category: string | null;
  base_price: number;
  per_unit_price: number | null;
  description: string | null;
  is_available: boolean;
  is_public: boolean;
  pricing_unit: string;
  currency: string;
  is_inventory_item: boolean;
  stock_qty: number;
  image_url: string | null;
  is_service?: boolean;
  service_duration_minutes?: number | null;
  slot_capacity?: number;
  buffer_minutes?: number;
  advance_booking_days?: number;
}
const MenuManagement = () => {
  const { restaurantId } = useRestaurantContext();
  const { data: menuItemsData = [], isLoading: loading } = useMenuItems();
  const menuItems = menuItemsData as MenuItem[];
  const invalidateMenu = useInvalidateMenuItems();
  const { data: settings } = useRestaurantSettings();
  const pricingUnits = useMemo<string[]>(() => {
    const raw = (settings as any)?.pricing_units;
    if (Array.isArray(raw) && raw.length) return raw.map((u: any) => String(u)).filter(Boolean);
    return ["per piece", "per scoop", "per serving", "per bowl"];
  }, [settings]);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [unitsDialogOpen, setUnitsDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = usePersistentState<string>("menu:search", "");
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "hidden">("all");
  const [collapsedCategoriesArr, setCollapsedCategoriesArr] = usePersistentState<string[]>("menu:collapsed", []);
  const collapsedCategories = useMemo(() => new Set(collapsedCategoriesArr), [collapsedCategoriesArr]);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);
  const [deleteRefCount, setDeleteRefCount] = useState<number>(0);
  const [checkingRefs, setCheckingRefs] = useState(false);
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [serviceFields, setServiceFields] = useState<ServiceFields>(DEFAULT_SERVICE_FIELDS);
  const [availability, setAvailability] = useState<AvailabilityWindow[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    base_price: "",
    per_unit_price: "",
    description: "",
    pricing_unit: "per piece",
    currency: "TRY",
    is_inventory_item: false,
    stock_qty: "",
    image_url: "",
  });

  // Load business_type once to set defaults
  useEffect(() => {
    if (!restaurantId) return;
    (async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("business_type")
        .eq("id", restaurantId)
        .maybeSingle();
      const bt = (data as any)?.business_type ?? null;
      setBusinessType(bt);
    })();
  }, [restaurantId]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      
      // Validate menu item data — allow zero base for per-unit-only items
      const basePriceRaw = (formData.base_price || "").trim();
      const basePrice = basePriceRaw === "" ? 0 : parseFloat(basePriceRaw);
      const perUnitPrice = formData.per_unit_price ? parseFloat(formData.per_unit_price) : null;

      if (isNaN(basePrice) || basePrice < 0) {
        toast.error("Base price must be zero or a positive number");
        setSaving(false);
        return;
      }

      if (perUnitPrice !== null && (isNaN(perUnitPrice) || perUnitPrice <= 0)) {
        toast.error("Per unit price must be a positive number");
        setSaving(false);
        return;
      }

      if (basePrice === 0 && (perUnitPrice == null || perUnitPrice <= 0)) {
        toast.error("Set either a base price or a per-unit price (or both)");
        setSaving(false);
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
        setSaving(false);
        return;
      }
      
      const itemData: any = {
        name: validation.data.name,
        category: validation.data.category,
        base_price: validation.data.base_price,
        per_unit_price: validation.data.per_unit_price,
        description: validation.data.description,
        pricing_unit: validation.data.pricing_unit,
        currency: validation.data.currency,
        is_inventory_item: serviceFields.is_service ? false : formData.is_inventory_item,
        stock_qty: serviceFields.is_service ? 0 : (formData.is_inventory_item ? parseInt(formData.stock_qty) || 0 : 0),
        image_url: formData.image_url || null,
        is_service: serviceFields.is_service,
        service_duration_minutes: serviceFields.is_service ? Math.max(parseInt(serviceFields.service_duration_minutes) || 60, 5) : null,
        slot_capacity: serviceFields.is_service ? Math.max(parseInt(serviceFields.slot_capacity) || 1, 1) : 1,
        buffer_minutes: serviceFields.is_service ? Math.max(parseInt(serviceFields.buffer_minutes) || 0, 0) : 0,
        advance_booking_days: serviceFields.is_service ? Math.max(parseInt(serviceFields.advance_booking_days) || 30, 1) : 30,
      };

      let savedItemId: string | null = null;
      if (editingItem) {
        const { error } = await supabase.from("menu_items").update(itemData).eq("id", editingItem.id);
        if (error) throw error;
        savedItemId = editingItem.id;
        toast.success("Menu item updated!");
      } else {
        if (!restaurantId) throw new Error("Restaurant not selected");
        const { data: inserted, error } = await supabase.from("menu_items").insert([{
          ...itemData,
          staff_id: user.id,
          restaurant_id: restaurantId
        }]).select("id").single();
        if (error) throw error;
        savedItemId = (inserted as any)?.id ?? null;
        toast.success("Menu item added!");
      }

      // Sync service availability windows (replace strategy)
      if (serviceFields.is_service && savedItemId && restaurantId) {
        await supabase.from("service_availability").delete().eq("menu_item_id", savedItemId);
        const rows = availability
          .filter((w) => w.start_time && w.end_time && w.start_time < w.end_time)
          .map((w) => ({
            menu_item_id: savedItemId,
            restaurant_id: restaurantId,
            weekday: w.weekday,
            start_time: w.start_time,
            end_time: w.end_time,
            is_active: w.is_active !== false,
          }));
        if (rows.length > 0) {
          await (supabase as any).from("service_availability").insert(rows);
        }
      }

      setDialogOpen(false);
      resetForm();
      invalidateMenu();
    } catch (error: any) {
      toast.error(error.message || "Failed to save menu item");
    } finally {
      setSaving(false);
    }
  };
  const requestDelete = async (item: MenuItem) => {
    setDeleteTarget(item);
    setDeleteRefCount(0);
    setCheckingRefs(true);
    try {
      const [orderItemsRes, tabItemsRes, bookingsRes] = await Promise.all([
        supabase.from("order_items").select("id", { count: "exact", head: true }).eq("menu_item_id", item.id),
        supabase.from("tab_items").select("id", { count: "exact", head: true }).eq("menu_item_id", item.id),
        supabase.from("service_bookings").select("id", { count: "exact", head: true }).eq("menu_item_id", item.id),
      ]);
      const total = (orderItemsRes.count ?? 0) + (tabItemsRes.count ?? 0) + (bookingsRes.count ?? 0);
      setDeleteRefCount(total);
    } catch {
      setDeleteRefCount(0);
    } finally {
      setCheckingRefs(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const item = deleteTarget;
    try {
      if (deleteRefCount > 0) {
        // Archive to preserve historical references
        const { error, data } = await supabase
          .from("menu_items")
          .update({ is_available: false, is_public: false })
          .eq("id", item.id)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error("You don't have permission to modify this item");
        }
        toast.success(`${item.name} archived (used in ${deleteRefCount} historical record${deleteRefCount === 1 ? "" : "s"})`);
      } else {
        const { error, data } = await supabase
          .from("menu_items")
          .delete()
          .eq("id", item.id)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error("You don't have permission to delete this item");
        }
        toast.success("Item deleted");
      }
      invalidateMenu();
    } catch (error: any) {
      console.error("Delete menu item failed", error);
      toast.error(error?.message || "Failed to delete item");
    } finally {
      setDeleteTarget(null);
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
      invalidateMenu();
    } catch (error: any) {
      toast.error("Failed to update availability");
    }
  };

  const handleTogglePublic = async (item: MenuItem) => {
    try {
      const { error } = await supabase
        .from("menu_items")
        .update({ is_public: !item.is_public })
        .eq("id", item.id);
      if (error) throw error;
      toast.success(`${item.name} is now ${!item.is_public ? 'public' : 'internal only'}`);
      invalidateMenu();
    } catch (error: any) {
      toast.error("Failed to update visibility");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${restaurantId || "shared"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("dish-photos").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("dish-photos").getPublicUrl(path);
      setFormData((prev) => ({ ...prev, image_url: data.publicUrl }));
      toast.success("Photo uploaded");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  };

  const removeImage = () => setFormData((prev) => ({ ...prev, image_url: "" }));
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
      stock_qty: item.stock_qty?.toString() || "",
      image_url: item.image_url || "",
    });
    setServiceFields({
      is_service: !!item.is_service,
      service_duration_minutes: (item.service_duration_minutes ?? 60).toString(),
      slot_capacity: (item.slot_capacity ?? 1).toString(),
      buffer_minutes: (item.buffer_minutes ?? 0).toString(),
      advance_booking_days: (item.advance_booking_days ?? 30).toString(),
    });
    setAvailability([]);
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
      stock_qty: "",
      image_url: "",
    });
    setServiceFields({
      ...DEFAULT_SERVICE_FIELDS,
      is_service: isServiceBusiness(businessType),
    });
    setAvailability([]);
    setEditingItem(null);
  };
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return menuItems.filter(item => {
      if (statusFilter === "available" && !item.is_available) return false;
      if (statusFilter === "hidden" && item.is_available) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q));
    });
  }, [menuItems, searchQuery, statusFilter]);

  const isSearching = searchQuery.trim().length > 0 || statusFilter !== "all";

  const categoryColor = (cat: string) => {
    let h = 0;
    for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    return `hsl(${hue} 70% 55%)`;
  };

  const groupedItems = filteredItems.reduce((acc, item) => {
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

  const toggleCategory = (cat: string) => {
    setCollapsedCategoriesArr(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return Array.from(next);
    });
  };

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
  const totalItems = menuItems.length;
  const totalAvailable = menuItems.filter(i => i.is_available).length;
  const totalPublic = menuItems.filter(i => i.is_public).length;
  const totalCategories = new Set(menuItems.map(i => i.category || "Uncategorized")).size;

  return <>
      <div className="max-w-6xl mx-auto space-y-6 px-3 sm:px-4 lg:px-5">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <span>serviceOS</span>
          <span className="mx-1.5 opacity-50">›</span>
          <span>Inventory & Supply</span>
          <span className="mx-1.5 opacity-50">›</span>
          <span className="text-foreground font-medium">Menu</span>
        </nav>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-[26px] font-bold leading-tight tracking-tight">Menu Management</h1>
            <p className="text-[13px] text-muted-foreground mt-1">Add and manage your menu items across categories</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={open => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
            <div className="flex flex-col sm:flex-row gap-2 flex-wrap w-full lg:w-auto">
              <Button
                variant="ghost"
                onClick={() => restaurantId && window.open(`/order/${restaurantId}`, "_blank", "noopener,noreferrer")}
                disabled={!restaurantId}
                className="w-full sm:w-auto"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Preview Public Page
              </Button>
              <Button variant="ghost" onClick={() => setShareDialogOpen(true)} disabled={availableItems.length === 0} className="w-full sm:w-auto">
                <Share2 className="h-4 w-4 mr-2" />
                Share Menu
              </Button>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto">
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
                    <Label htmlFor="base_price">Base Price</Label>
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
                      placeholder="0 = per-unit only"
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
                <p className="text-xs text-muted-foreground -mt-2">
                  Leave Base Price as 0 to charge by units only (e.g. per kg, per hour).
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="pricing_unit">Pricing Unit *</Label>
                      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setUnitsDialogOpen(true)}>
                        Manage
                      </Button>
                    </div>
                    <Select value={formData.pricing_unit} onValueChange={value => setFormData({
                    ...formData,
                    pricing_unit: value
                  })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {pricingUnits.map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Currency is always TRY, read-only */}
                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <p className="text-sm text-muted-foreground border rounded-md p-2">₺ Turkish Lira (TRY)</p>
                  </div>
                </div>
                <ServiceFormSection
                  menuItemId={editingItem?.id}
                  values={serviceFields}
                  onChange={setServiceFields}
                  availability={availability}
                  onAvailabilityChange={setAvailability}
                />

                {!serviceFields.is_service && (
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="is_inventory_item" 
                        checked={formData.is_inventory_item}
                        onCheckedChange={(checked) => setFormData({ ...formData, is_inventory_item: checked === true })}
                      />
                      <Label htmlFor="is_inventory_item" className="text-sm font-medium">
                        Inventory Item
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Tracks stock and auto-creates a matching row in <strong>Inventory</strong>. Updating the quantity in Inventory will sync back here.
                    </p>
                    {formData.is_inventory_item && (
                      <div className="space-y-2">
                        <Label htmlFor="stock_qty">Stock Quantity</Label>
                        <Input 
                          id="stock_qty" 
                          type="number" 
                          min="0"
                          value={formData.stock_qty} 
                          onChange={e => setFormData({ ...formData, stock_qty: e.target.value })}
                          placeholder="Enter available quantity"
                        />
                      </div>
                    )}
                  </div>
                )}
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
                <div className="space-y-2">
                  <Label>Item Image (shown on public order page)</Label>
                  {formData.image_url ? (
                    <div className="relative w-full h-40 rounded-md overflow-hidden border bg-muted">
                      <img src={formData.image_url} alt="Item" className="w-full h-full object-cover" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-7 w-7"
                        onClick={removeImage}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-input rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
                      <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                      <span className="text-sm text-muted-foreground">
                        {uploadingImage ? "Uploading..." : "Click to upload (max 5MB)"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={uploadingImage}
                      />
                    </label>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={saving} className="flex-1">
                    {saving ? "Saving..." : editingItem ? "Update" : "Add"} Item
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

          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogContent className="max-w-5xl h-[85vh] p-0 overflow-hidden">
              <DialogHeader className="px-6 pt-6 pb-2">
                <DialogTitle className="flex items-center justify-between gap-2">
                  <span>Public Order Page Preview</span>
                  {restaurantId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`/order/${restaurantId}`, "_blank")}
                    >
                      <ExternalLink className="h-3 w-3 mr-2" />
                      Open in new tab
                    </Button>
                  )}
                </DialogTitle>
                <DialogDescription>
                  This is exactly what customers see when they visit your public ordering link.
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-hidden border-t">
                {restaurantId && (
                  <iframe
                    src={`/order/${restaurantId}`}
                    className="w-full h-full"
                    title="Public order preview"
                  />
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading && <p className="text-center text-muted-foreground">Loading menu...</p>}

        {!loading && menuItems.length > 0 && (
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
            {[
              { label: "Total Items", value: totalItems, suffix: `${totalItems} items`, accent: "hsl(var(--primary))" },
              { label: "Available", value: totalAvailable, suffix: `${totalAvailable} available`, accent: "hsl(142 71% 45%)" },
              { label: "Public", value: totalPublic, suffix: `${totalPublic} public`, accent: "hsl(199 89% 48%)" },
              { label: "Categories", value: totalCategories, suffix: `${totalCategories} categories`, accent: "hsl(38 92% 50%)" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-[10px] border bg-card px-3.5 py-3"
                style={{ borderTop: `2px solid ${s.accent}` }}
              >
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{s.label}</div>
                <div className="text-[18px] font-bold font-mono mt-1" style={{ color: s.accent }}>{s.value}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{s.suffix}</div>
              </div>
            ))}
          </div>
        )}

        {!loading && menuItems.length > 0 && (
          <div className="flex gap-2.5 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search menu items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 text-[13px]"
              />
            </div>
            <div className="flex gap-1 rounded-[10px] border bg-card p-1 overflow-x-auto scrollbar-none">
              {(["all", "available", "hidden"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setStatusFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                    statusFilter === f
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && menuItems.length === 0 && <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">No menu items yet</p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Item
              </Button>
            </CardContent>
          </Card>}

        {!loading && filteredItems.length > 0 && <div className="space-y-2">
            {Object.entries(groupedItems).map(([category, items]) => {
              const isOpen = isSearching || !collapsedCategories.has(category);
              const color = categoryColor(category);
              const availCount = items.filter(i => i.is_available).length;
              return (
                <Collapsible key={category} open={isOpen} onOpenChange={() => !isSearching && toggleCategory(category)} className="rounded-xl border bg-card overflow-hidden">
                  <CollapsibleTrigger className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors select-none">
                    <div
                      className="h-8 w-8 rounded-[9px] flex-shrink-0 border"
                      style={{ background: `${color.replace(")", " / 0.18)").replace("hsl", "hsla")}`, borderColor: color.replace(")", " / 0.3)").replace("hsl", "hsla") }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-bold truncate">{category}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{availCount} of {items.length} items available</div>
                    </div>
                    <span
                      className="text-[11px] px-2.5 py-1 rounded-md font-medium flex-shrink-0"
                      style={{ background: color.replace(")", " / 0.15)").replace("hsl", "hsla"), color }}
                    >
                      {items.length} items
                    </span>
                    <ChevronDown
                      className="h-[18px] w-[18px] text-muted-foreground flex-shrink-0 transition-transform"
                      style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid gap-3.5 p-3.5 pt-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                      {items.map(item => (
                        <div
                          key={item.id}
                          className="group flex flex-col rounded-xl bg-card border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                          style={{ borderLeft: `3px solid ${color}` }}
                        >
                          <div
                            className="flex items-start justify-between gap-2 px-3.5 pt-3.5 pb-2.5 border-b"
                            style={{
                              background: `linear-gradient(135deg, ${color.replace(")", " / 0.13)").replace("hsl", "hsla")}, ${color.replace(")", " / 0.03)").replace("hsl", "hsla")})`,
                              borderBottomColor: color.replace(")", " / 0.13)").replace("hsl", "hsla"),
                            }}
                          >
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} className="h-10 w-10 rounded-[10px] object-cover flex-shrink-0 border" style={{ borderColor: color.replace(")", " / 0.3)").replace("hsl", "hsla") }} />
                            ) : (
                              <div
                                className="h-10 w-10 rounded-[10px] flex items-center justify-center flex-shrink-0 border text-[18px]"
                                style={{
                                  background: color.replace(")", " / 0.18)").replace("hsl", "hsla"),
                                  borderColor: color.replace(")", " / 0.3)").replace("hsl", "hsla"),
                                  color,
                                }}
                              >
                                {item.is_service ? <CalendarClock className="h-5 w-5" /> : (item.name?.[0]?.toUpperCase() || "•")}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1.5 justify-end">
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                                  item.is_available
                                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                    : "bg-destructive/15 text-destructive"
                                }`}
                              >
                                {item.is_available ? "Available" : "Unavailable"}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                                  item.is_public
                                    ? "bg-primary/15 text-primary"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {item.is_public ? "Public" : "Hidden"}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2.5 px-3.5 py-3 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-[13px] font-bold leading-tight flex-1 break-words">{item.name}</div>
                              <div className="text-[14px] font-bold font-mono flex-shrink-0" style={{ color }}>
                                {item.base_price > 0 ? formatPrice(item.base_price, item.currency) : (item.per_unit_price ? formatPrice(item.per_unit_price, item.currency) : "—")}
                              </div>
                            </div>

                            {item.per_unit_price && item.base_price > 0 && (
                              <div className="text-[11px] text-muted-foreground font-mono -mt-1.5">
                                +{formatPrice(item.per_unit_price, item.currency)} / {item.pricing_unit}
                              </div>
                            )}

                            {item.is_service ? (
                              <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                                <CalendarClock className="h-3 w-3" />
                                {item.service_duration_minutes ?? 60} min · {item.slot_capacity ?? 1}/slot
                              </div>
                            ) : item.is_inventory_item && (
                              <div className={`text-[11px] inline-flex items-center gap-1 ${item.stock_qty > 0 ? "text-muted-foreground" : "text-destructive"}`}>
                                Stock: {item.stock_qty}
                              </div>
                            )}

                            {item.description && (
                              <p className="text-[11px] text-muted-foreground line-clamp-2">{item.description}</p>
                            )}

                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[12px] text-muted-foreground">Available for orders</span>
                              <Switch checked={item.is_available} onCheckedChange={() => handleToggleAvailability(item)} />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[12px] text-muted-foreground">Visible to public</span>
                              <Switch checked={item.is_public} onCheckedChange={() => handleTogglePublic(item)} />
                            </div>

                            <div className="border-t pt-2.5 mt-auto flex gap-1.5">
                              <Button variant="outline" size="sm" onClick={() => handleEdit(item)} className="flex-1 h-8 text-[13px]">
                                <Pencil className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => requestDelete(item)}
                                className="h-8 w-8 border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => {
                          resetForm();
                          setFormData(prev => ({ ...prev, category }));
                          setDialogOpen(true);
                        }}
                        className="rounded-xl border-2 border-dashed border-border/60 min-h-[175px] flex flex-col items-center justify-center gap-1.5 text-muted-foreground text-xs transition-all hover:bg-muted/30"
                        style={{ ['--cat' as any]: color }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = color; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.color = ""; }}
                      >
                        <span className="text-[20px] leading-none">+</span>
                        <span className="font-medium">Add to {category}</span>
                      </button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}

            <button
              type="button"
              onClick={() => { resetForm(); setDialogOpen(true); }}
              className="w-full rounded-xl border-2 border-dashed border-border/60 px-5 py-[18px] flex items-center justify-center gap-2.5 text-muted-foreground text-[13px] font-medium transition-all hover:border-primary hover:text-primary hover:bg-primary/5 mt-2"
            >
              <span className="text-[20px] leading-none">+</span>
              Add New Category
            </button>
          </div>}

        {!loading && filteredItems.length === 0 && menuItems.length > 0 && (
          <div className="text-center px-5 py-[60px]">
            <div className="text-[40px] mb-2">🔍</div>
            <div className="text-[15px] font-bold mb-1.5">No items found</div>
            <div className="text-[13px] text-muted-foreground">Try a different search or filter</div>
          </div>
        )}



        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {deleteRefCount > 0 ? `Archive "${deleteTarget?.name}"?` : `Delete "${deleteTarget?.name}"?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {checkingRefs
                  ? "Checking for related records..."
                  : deleteRefCount > 0
                  ? `This item appears in ${deleteRefCount} historical order/tab/booking record${deleteRefCount === 1 ? "" : "s"}. To preserve those records, the item will be archived (hidden from menus) instead of deleted.`
                  : "This will permanently delete the item. This cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} disabled={checkingRefs}>
                {deleteRefCount > 0 ? "Archive" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <ManageUnitsDialog
          open={unitsDialogOpen}
          onOpenChange={setUnitsDialogOpen}
          restaurantId={restaurantId}
          units={pricingUnits}
        />
      </div>
    </>;
};
export default MenuManagement;