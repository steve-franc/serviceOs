import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Megaphone, Trash2, Plus, Pencil } from "lucide-react";

export default function Broadcasts() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null | undefined>(undefined); // undefined = closed, null = new, object = edit

  const { data, isLoading } = useQuery({
    queryKey: ["super", "broadcasts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("superadmin_list_broadcasts");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: restaurantMap } = useQuery({
    queryKey: ["super", "restaurants", "name-map"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id, name");
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { map[r.id] = r.name; });
      return map;
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["super", "broadcasts"] });

  const toggle = async (id: string, active: boolean) => {
    const { error } = await supabase.rpc("superadmin_toggle_broadcast", { _id: id, _active: active });
    if (error) return toast.error(error.message);
    refresh();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this broadcast?")) return;
    const { error } = await supabase.rpc("superadmin_delete_broadcast", { _id: id });
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    refresh();
  };

  const dialogOpen = editing !== undefined;

  return (
    <>
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-primary" /> Broadcasts
            </h1>
            <p className="text-sm text-muted-foreground">Send platform-wide announcements with frequency control</p>
          </div>
          <Button onClick={() => setEditing(null)}><Plus className="h-4 w-4 mr-2" /> New broadcast</Button>
        </div>

        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : (data ?? []).length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No broadcasts yet. Create one to send a popup to all users.
            </div>
          ) : (
            (data ?? []).map((b: any) => (
              <div key={b.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{b.title}</p>
                    <Badge variant="outline" className="text-[10px]">{b.variant}</Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {b.audience === "restaurant"
                        ? `→ ${restaurantMap?.[b.restaurant_id] ?? "business"}`
                        : b.audience}
                    </Badge>
                    {b.expires_at && new Date(b.expires_at) < new Date() && (
                      <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40">expired</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{b.body}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Every {b.frequency_hours === 0 ? "once" : `${b.frequency_hours}h`} · max {b.max_shows === 0 ? "∞" : b.max_shows} shows ·
                    {" "}{b.total_views} views · {b.total_dismissed} dismissed
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={b.is_active} onCheckedChange={(v) => toggle(b.id, v)} />
                    <span className="text-xs text-muted-foreground">{b.is_active ? "Active" : "Paused"}</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(b)} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(b.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setEditing(undefined); }}>
        {dialogOpen && (
          <BroadcastForm
            existing={editing}
            onClose={() => { setEditing(undefined); refresh(); }}
          />
        )}
      </Dialog>
    </>
  );
}

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function BroadcastForm({ existing, onClose }: { existing: any | null; onClose: () => void }) {
  const isEdit = !!existing;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [ctaLabel, setCtaLabel] = useState(existing?.cta_label ?? "");
  const [ctaUrl, setCtaUrl] = useState(existing?.cta_url ?? "");
  const [variant, setVariant] = useState(existing?.variant ?? "info");
  const [audience, setAudience] = useState(existing?.audience ?? "all");
  const [restaurantId, setRestaurantId] = useState<string>(existing?.restaurant_id ?? "");
  const [frequencyHours, setFrequencyHours] = useState(String(existing?.frequency_hours ?? 24));
  const [maxShows, setMaxShows] = useState(String(existing?.max_shows ?? 0));
  const [expiresAt, setExpiresAt] = useState(toLocalInput(existing?.expires_at));
  const [busy, setBusy] = useState(false);

  const { data: restaurants } = useQuery({
    queryKey: ["super", "restaurants", "broadcast-target"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: audience === "restaurant",
  });

  const submit = async () => {
    if (!title.trim() || !body.trim()) return toast.error("Title and message required");
    if (audience === "restaurant" && !restaurantId) return toast.error("Select a business");
    setBusy(true);
    const params = {
      _title: title.trim(),
      _body: body.trim(),
      _cta_label: ctaLabel.trim() || null,
      _cta_url: ctaUrl.trim() || null,
      _variant: variant,
      _audience: audience,
      _restaurant_id: audience === "restaurant" ? restaurantId : null,
      _frequency_hours: parseInt(frequencyHours) || 0,
      _max_shows: parseInt(maxShows) || 0,
      _expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    };
    const { error } = isEdit
      ? await supabase.rpc("superadmin_update_broadcast", { _id: existing.id, ...params })
      : await supabase.rpc("superadmin_create_broadcast", params);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(isEdit ? "Broadcast updated" : "Broadcast sent");
    onClose();
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit broadcast" : "New broadcast"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </div>
        <div>
          <Label className="text-xs">Message</Label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={4} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Style</Label>
            <Select value={variant} onValueChange={setVariant}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="promo">Promo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Audience</Label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="superadmins">Superadmins only</SelectItem>
                <SelectItem value="restaurant">Specific business</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {audience === "restaurant" && (
          <div>
            <Label className="text-xs">Target business</Label>
            <Select value={restaurantId} onValueChange={setRestaurantId}>
              <SelectTrigger><SelectValue placeholder="Select a business…" /></SelectTrigger>
              <SelectContent>
                {(restaurants ?? []).map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">CTA label (optional)</Label>
            <Input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={40} placeholder="Learn more" />
          </div>
          <div>
            <Label className="text-xs">CTA link (optional)</Label>
            <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://…" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Re-show every (h)</Label>
            <Input type="number" value={frequencyHours} onChange={(e) => setFrequencyHours(e.target.value)} min={0} />
            <p className="text-[10px] text-muted-foreground mt-0.5">0 = once</p>
          </div>
          <div>
            <Label className="text-xs">Max shows</Label>
            <Input type="number" value={maxShows} onChange={(e) => setMaxShows(e.target.value)} min={0} />
            <p className="text-[10px] text-muted-foreground mt-0.5">0 = unlimited</p>
          </div>
          <div>
            <Label className="text-xs">Expires</Label>
            <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? "Saving…" : isEdit ? "Save changes" : "Send broadcast"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
