import { useState, useEffect, useMemo } from "react";
import { format, addDays, isSameDay, startOfDay } from "date-fns";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AvailableSlot {
  start_at: string;
  end_at: string;
  remaining: number;
}

interface BookSlotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuItemId: string;
  menuItemName: string;
  durationMinutes: number;
  advanceDays: number;
  onConfirm: (slotAt: string) => void;
}

export function BookSlotDialog({
  open,
  onOpenChange,
  menuItemId,
  menuItemName,
  durationMinutes,
  advanceDays,
  onConfirm,
}: BookSlotDialogProps) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const maxDate = useMemo(() => addDays(today, Math.max(advanceDays, 1)), [today, advanceDays]);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loading, setLoading] = useState(false);

  // Load slots for the visible window once when dialog opens, then filter client-side
  const [windowSlots, setWindowSlots] = useState<AvailableSlot[]>([]);

  useEffect(() => {
    if (!open) return;
    setSelectedDate(undefined);
    setSelectedSlot(null);
    setSlots([]);
    setLoading(true);
    (async () => {
      const { data, error } = await (supabase as any).rpc("get_available_slots", {
        _menu_item_id: menuItemId,
        _from: format(today, "yyyy-MM-dd"),
        _to: format(maxDate, "yyyy-MM-dd"),
      });
      if (error) {
        toast.error(error.message || "Failed to load available times");
        setWindowSlots([]);
      } else {
        setWindowSlots((data as AvailableSlot[]) || []);
      }
      setLoading(false);
    })();
  }, [open, menuItemId, today, maxDate]);

  // Filter for the day the user picks
  useEffect(() => {
    if (!selectedDate) {
      setSlots([]);
      return;
    }
    setSlots(
      windowSlots.filter((s) => isSameDay(new Date(s.start_at), selectedDate))
    );
    setSelectedSlot(null);
  }, [selectedDate, windowSlots]);

  // Days that have any availability
  const enabledDays = useMemo(() => {
    const set = new Set<string>();
    windowSlots.forEach((s) => {
      set.add(format(new Date(s.start_at), "yyyy-MM-dd"));
    });
    return set;
  }, [windowSlots]);

  const handleConfirm = () => {
    if (!selectedSlot) return;
    onConfirm(selectedSlot);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Book {menuItemName}
          </DialogTitle>
          <DialogDescription>
            {durationMinutes} min · pick a date and time
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={(date) => {
                  if (date < today) return true;
                  if (date > maxDate) return true;
                  return !enabledDays.has(format(date, "yyyy-MM-dd"));
                }}
                fromDate={today}
                toDate={maxDate}
                className={cn("p-3 pointer-events-auto rounded-md border")}
              />
            </div>
          )}

          {selectedDate && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">
                  Available times · {format(selectedDate, "EEEE, do MMMM")}
                </h4>
              </div>
              {slots.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No available times on this day.
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {slots.map((s) => {
                    const selected = selectedSlot === s.start_at;
                    return (
                      <button
                        type="button"
                        key={s.start_at}
                        onClick={() => setSelectedSlot(s.start_at)}
                        className={cn(
                          "rounded-md border px-2 py-2 text-sm font-medium transition-colors",
                          selected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-input hover:bg-accent"
                        )}
                      >
                        {format(new Date(s.start_at), "HH:mm")}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedSlot}>
            Confirm slot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
