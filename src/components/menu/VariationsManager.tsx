import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { formatPrice } from "@/lib/currency";

interface Variation {
  id: string;
  name: string;
  price_adjustment: number;
  is_available: boolean;
}

interface VariationsManagerProps {
  menuItemId: string;
  menuItemName: string;
  basePrice: number;
  currency: string;
  variations: Variation[];
  onVariationsChange: () => void;
}

const VariationsManager = ({
  menuItemId,
  menuItemName,
  basePrice,
  currency,
  variations,
  onVariationsChange,
}: VariationsManagerProps) => {
  const [newVariation, setNewVariation] = useState({ name: "", price_adjustment: "" });
  const [adding, setAdding] = useState(false);

  const handleAddVariation = async () => {
    if (!newVariation.name.trim()) {
      toast.error("Variation name is required");
      return;
    }

    const priceAdjustment = parseFloat(newVariation.price_adjustment) || 0;

    setAdding(true);
    try {
      const { error } = await supabase.from("menu_item_variations").insert({
        menu_item_id: menuItemId,
        name: newVariation.name.trim(),
        price_adjustment: priceAdjustment,
      });

      if (error) throw error;

      toast.success("Variation added");
      setNewVariation({ name: "", price_adjustment: "" });
      onVariationsChange();
    } catch (error: any) {
      if (error.code === "23505") {
        toast.error("A variation with this name already exists");
      } else {
        toast.error("Failed to add variation");
      }
    } finally {
      setAdding(false);
    }
  };

  const handleToggleAvailability = async (variation: Variation) => {
    try {
      const { error } = await supabase
        .from("menu_item_variations")
        .update({ is_available: !variation.is_available })
        .eq("id", variation.id);

      if (error) throw error;
      toast.success(`${variation.name} is now ${!variation.is_available ? "available" : "unavailable"}`);
      onVariationsChange();
    } catch (error) {
      toast.error("Failed to update variation");
    }
  };

  const handleDeleteVariation = async (variationId: string) => {
    try {
      const { error } = await supabase
        .from("menu_item_variations")
        .delete()
        .eq("id", variationId);

      if (error) throw error;
      toast.success("Variation deleted");
      onVariationsChange();
    } catch (error) {
      toast.error("Failed to delete variation");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">Variations for {menuItemName}</h4>
      </div>

      {/* Existing variations */}
      {variations.length > 0 && (
        <div className="space-y-2">
          {variations.map((variation) => (
            <div
              key={variation.id}
              className="flex items-center justify-between p-3 bg-muted rounded-lg"
            >
              <div className="flex items-center gap-3">
                <Switch
                  checked={variation.is_available}
                  onCheckedChange={() => handleToggleAvailability(variation)}
                />
                <div>
                  <p className="font-medium">{variation.name}</p>
                  <Badge variant={variation.price_adjustment >= 0 ? "secondary" : "outline"}>
                    {variation.price_adjustment >= 0 ? "+" : ""}
                    {formatPrice(variation.price_adjustment, currency)}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-2">
                    (Total: {formatPrice(basePrice + variation.price_adjustment, currency)})
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteVariation(variation.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add new variation */}
      <div className="flex gap-2 items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor="variation-name" className="text-xs">Name</Label>
          <Input
            id="variation-name"
            placeholder="e.g., Large, Extra Cheese"
            value={newVariation.name}
            onChange={(e) => setNewVariation({ ...newVariation, name: e.target.value })}
            maxLength={100}
          />
        </div>
        <div className="w-32 space-y-1">
          <Label htmlFor="price-adjustment" className="text-xs">Price +/-</Label>
          <Input
            id="price-adjustment"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={newVariation.price_adjustment}
            onChange={(e) => setNewVariation({ ...newVariation, price_adjustment: e.target.value })}
          />
        </div>
        <Button onClick={handleAddVariation} disabled={adding} size="icon">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default VariationsManager;
