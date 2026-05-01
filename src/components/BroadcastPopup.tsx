import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useRestaurantAndRole } from "@/hooks/useRestaurantAndRole";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Megaphone, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";

const variantIcon: Record<string, any> = {
  info: Megaphone,
  warning: AlertTriangle,
  success: CheckCircle2,
  promo: Sparkles,
};

const variantClass: Record<string, string> = {
  info: "text-primary",
  warning: "text-amber-500",
  success: "text-emerald-500",
  promo: "text-fuchsia-500",
};

export function BroadcastPopup() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["broadcast", "active", user?.id],
    enabled: !!user,
    refetchOnMount: true,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_active_broadcast_for_user");
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    if (data) {
      setOpen(true);
      // mark as seen (not dismissed yet)
      supabase.rpc("mark_broadcast_seen", { _broadcast_id: data.id, _dismissed: false });
    }
  }, [data?.id]);

  if (!data) return null;
  const Icon = variantIcon[data.variant] || Megaphone;
  const iconClass = variantClass[data.variant] || variantClass.info;

  const dismiss = async () => {
    await supabase.rpc("mark_broadcast_seen", { _broadcast_id: data.id, _dismissed: true });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["broadcast", "active"] });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className={`flex items-center gap-2 ${iconClass}`}>
            <Icon className="h-5 w-5" />
            <span className="text-xs uppercase tracking-wide font-medium">Announcement</span>
          </div>
          <DialogTitle className="text-xl">{data.title}</DialogTitle>
          <DialogDescription className="whitespace-pre-wrap text-sm pt-1">
            {data.body}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={dismiss}>Dismiss</Button>
          {data.cta_label && data.cta_url && (
            <Button
              onClick={() => {
                window.open(data.cta_url, "_blank", "noopener,noreferrer");
                dismiss();
              }}
            >
              {data.cta_label}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
