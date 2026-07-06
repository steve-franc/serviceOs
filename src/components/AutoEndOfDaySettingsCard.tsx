import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantSettings } from "@/hooks/useQueries";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  restaurantId: string | null | undefined;
  readOnly?: boolean;
}

export default function AutoEndOfDaySettingsCard({ restaurantId, readOnly }: Props) {
  const { data: settings } = useRestaurantSettings();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const enabled = (settings as any)?.auto_end_of_day_enabled !== false;
  const lastManual = (settings as any)?.last_manual_end_at as string | null | undefined;

  const toggle = async (next: boolean) => {
    if (!restaurantId || readOnly) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("restaurant_settings")
        .update({ auto_end_of_day_enabled: next })
        .eq("restaurant_id", restaurantId);
      if (error) throw error;
      if (next) {
        await supabase.rpc("reset_auto_day_end", { _restaurant_id: restaurantId });
      }
      qc.invalidateQueries({ queryKey: ["restaurant-settings", restaurantId] });
      toast.success(next ? "Auto end-of-day resumed" : "Auto end-of-day paused");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update setting");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Auto End-of-Day</CardTitle>
        </div>
        <CardDescription>
          Automatically close books at 11:59 PM in your business's timezone. Runs on the server every day even when no device is online.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted p-4 flex-wrap">
          <div className="space-y-0.5 pr-3 min-w-0">
            <Label className="text-sm font-medium">Enable automatic nightly close</Label>
            <p className={`text-xs ${enabled ? "text-emerald-600" : "text-destructive"}`}>
              {enabled ? "Books close automatically at 11:59 PM." : "Paused — you'll have to close manually."}
            </p>
            {lastManual && (
              <p className="text-xs text-muted-foreground mt-1">
                Last manual close: {format(new Date(lastManual), "PPp")}
              </p>
            )}
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={toggle}
            disabled={readOnly || saving || !restaurantId}
            aria-label="Toggle auto end-of-day"
          />
        </div>
      </CardContent>
    </Card>
  );
}
