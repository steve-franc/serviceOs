import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Note {
  id: string;
  body: string;
  staff_id: string;
  created_at: string;
  staff_name?: string;
}

interface Props {
  restaurantId: string | null;
}

export function WorkdayNotes({ restaurantId }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      // Cutoff = last End Day (mirrors expenses pattern)
      const { data: lastReport } = await supabase
        .from("daily_reports")
        .select("created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const cutoff = lastReport ? new Date(lastReport.created_at) : new Date(0);

      const { data, error } = await supabase
        .from("workday_notes")
        .select("id, body, staff_id, created_at")
        .eq("restaurant_id", restaurantId)
        .is("applies_to_report_id", null)
        .gte("created_at", cutoff.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data || []) as Note[];
      const ids = [...new Set(rows.map((n) => n.staff_id))];
      if (ids.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        const map = new Map(profiles?.map((p: any) => [p.id, p.full_name]) || []);
        rows.forEach((n) => (n.staff_name = map.get(n.staff_id) || ""));
      }
      setNotes(rows);
    } catch (e: any) {
      toast.error(e.message || "Failed to load notes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (!restaurantId) return;
    const ch = supabase
      .channel(`workday-notes-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workday_notes", filter: `restaurant_id=eq.${restaurantId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const add = async () => {
    const body = draft.trim();
    if (!body) return;
    if (!restaurantId) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("workday_notes").insert({
        restaurant_id: restaurantId,
        staff_id: user.id,
        body: body.slice(0, 2000),
      });
      if (error) throw error;
      setDraft("");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to add note");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const { error } = await supabase.from("workday_notes").delete().eq("id", id);
      if (error) throw error;
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete note");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <NotebookPen className="h-5 w-5" />
          Workday Notes
        </CardTitle>
        <CardDescription>
          Record events as they happen — anything noted today will appear in tonight's daily report.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            placeholder="e.g. Power outage 2:15-2:45 pm; refunded table 4."
            className="min-h-[60px] flex-1"
            maxLength={2000}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button onClick={add} disabled={saving || !draft.trim()} className="sm:self-end">
            {saving ? "Adding..." : "Add Note"}
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet today.</p>
        ) : (
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="flex items-start gap-3 rounded-md border bg-muted/20 p-3">
                <div className="flex-1 min-w-0">
                  <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {format(new Date(n.created_at), "h:mm a")}
                    {n.staff_name ? ` · ${n.staff_name}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(n.id)}
                  aria-label="Delete note"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
