import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  restaurantId: string | null;
  units: string[];
}

export function ManageUnitsDialog({ open, onOpenChange, restaurantId, units }: Props) {
  const [list, setList] = useState<string[]>(units);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (open) setList(units);
  }, [open, units]);

  const addUnit = () => {
    const v = draft.trim().slice(0, 50);
    if (!v) return;
    if (list.includes(v)) {
      toast.error("That unit already exists");
      return;
    }
    setList([...list, v]);
    setDraft("");
  };

  const removeUnit = (u: string) => setList(list.filter((x) => x !== u));

  const save = async () => {
    if (!restaurantId) return;
    if (list.length === 0) {
      toast.error("Keep at least one unit");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("restaurant_settings")
        .update({ pricing_units: list as any })
        .eq("restaurant_id", restaurantId);
      if (error) throw error;
      toast.success("Units updated");
      qc.invalidateQueries({ queryKey: ["restaurant-settings", restaurantId] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save units");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Pricing Units</DialogTitle>
          <DialogDescription>
            Define the units used to price your items (e.g. per piece, per kg, per hour).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {list.map((u) => (
              <Badge key={u} variant="secondary" className="gap-1 pr-1">
                {u}
                <button
                  type="button"
                  onClick={() => removeUnit(u)}
                  className="hover:bg-background/40 rounded p-0.5"
                  aria-label={`Remove ${u}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {list.length === 0 && (
              <p className="text-sm text-muted-foreground">No units yet. Add one below.</p>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. per kg"
              maxLength={50}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addUnit();
                }
              }}
            />
            <Button type="button" onClick={addUnit} variant="outline">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
