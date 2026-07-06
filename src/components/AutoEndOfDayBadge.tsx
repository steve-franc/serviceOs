import { useState } from "react";
import { CheckCircle2, PauseCircle, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "@/hooks/useRestaurantAndRole";
import { useRestaurantSettings } from "@/hooks/useQueries";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Compute the next 23:59 in the restaurant's IANA timezone as a real Date.
 * If today's local time is already past 23:59, roll to tomorrow.
 */
function nextLocal2359(tz: string): Date {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const localHour = Number(parts.hour);
  const localMin = Number(parts.minute);
  // Build a Date for today 23:59 in that TZ by iterating: start with UTC guess then correct.
  // Simple approach: today's local date at 23:59 -> parse as if in that TZ using an offset probe.
  const todayLocalDate = `${parts.year}-${parts.month}-${parts.day}`;
  let target = zonedDate(todayLocalDate, "23:59", tz);
  if (localHour === 23 && localMin >= 59) {
    // roll to tomorrow local
    const tomorrow = new Date(target.getTime() + 24 * 60 * 60 * 1000);
    const t = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(tomorrow);
    const tp = Object.fromEntries(t.map((p) => [p.type, p.value]));
    target = zonedDate(`${tp.year}-${tp.month}-${tp.day}`, "23:59", tz);
  }
  return target;
}

function zonedDate(ymd: string, hm: string, tz: string): Date {
  // Convert a "wall-clock" YYYY-MM-DD HH:mm in `tz` to a real Date by
  // iterating the UTC offset until Intl reports the same local wall-clock.
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hm.split(":").map(Number);
  let ts = Date.UTC(y, m - 1, d, hh, mm, 0);
  // Probe: read what that UTC instant looks like in tz, compute delta.
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(new Date(ts)).map((p) => [p.type, p.value]),
    );
    const asUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), 0,
    );
    const wanted = Date.UTC(y, m - 1, d, hh, mm, 0);
    const delta = wanted - asUtc;
    if (delta === 0) break;
    ts += delta;
  }
  return new Date(ts);
}

function formatNext(target: Date, tz: string): string {
  const now = new Date();
  const dayFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "long",
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true,
  });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const targetDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(target);
  const label = today === targetDay ? "Today" : "Tomorrow";
  // Use the weekday only if beyond tomorrow (safety fallback).
  const tomorrow = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const dayLabel = targetDay === today ? "Today" : targetDay === tomorrow ? "Tomorrow" : dayFmt.format(target);
  return `${dayLabel} at ${timeFmt.format(target)}`;
}

interface Props {
  className?: string;
}

export function AutoEndOfDayBadge({ className }: Props) {
  const { restaurantId } = useRestaurantContext();
  const { data: settings } = useRestaurantSettings();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const enabled = (settings as any)?.auto_end_of_day_enabled !== false;
  const tz = (settings as any)?.timezone || "Europe/Istanbul";

  let nextLabel = "—";
  try {
    nextLabel = formatNext(nextLocal2359(tz), tz);
  } catch {
    /* keep dash */
  }

  const resume = async () => {
    if (!restaurantId || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("restaurant_settings")
        .update({ auto_end_of_day_enabled: true })
        .eq("restaurant_id", restaurantId);
      if (error) throw error;
      await supabase.rpc("reset_auto_day_end", { _restaurant_id: restaurantId });
      qc.invalidateQueries({ queryKey: ["restaurant-settings", restaurantId] });
      toast.success(`Auto end-of-day resumed. Next close: ${nextLabel}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to restart auto end-of-day. Please try again.");
    } finally {
      // 2s cooldown to prevent double-clicks
      setTimeout(() => setBusy(false), 2000);
    }
  };

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold",
          enabled
            ? "bg-accent2/15 text-accent2"
            : "bg-muted text-muted-foreground",
        )}
        title={enabled ? `Next automatic close: ${nextLabel}` : "Automatic close is paused"}
      >
        {enabled ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Auto End-of-Day Active
            <span className="hidden sm:inline text-[11px] font-normal opacity-80 ml-1">
              · Next: {nextLabel}
            </span>
          </>
        ) : (
          <>
            <PauseCircle className="h-3.5 w-3.5" />
            Auto End-of-Day Paused
          </>
        )}
      </span>
      {!enabled && (
        <Button
          onClick={resume}
          disabled={busy}
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-lg"
        >
          <RotateCcw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
          {busy ? "Resuming…" : "Resume Auto End-of-Day"}
        </Button>
      )}
    </div>
  );
}
