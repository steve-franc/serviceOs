import { Bell, Check, Trash2, CircleAlert, CircleCheck, Info, AlertTriangle, MessageSquare, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useNotifications, notificationsStore, type NotificationType } from "@/stores/notifications";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { getSoundEnabled, setSoundEnabled, getVolume, setVolume } from "@/lib/notification-prefs";
import { playNotificationSound } from "@/hooks/useSoundNotification";

const iconFor = (t: NotificationType) => {
  switch (t) {
    case "success": return <CircleCheck className="h-4 w-4 text-emerald-500" />;
    case "error": return <CircleAlert className="h-4 w-4 text-destructive" />;
    case "warning": return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case "info": return <Info className="h-4 w-4 text-primary" />;
    default: return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
  }
};

export const NotificationCenter = () => {
  const entries = useNotifications();
  const [open, setOpen] = useState(false);
  const [soundOn, setSoundOnState] = useState(getSoundEnabled());
  const [volume, setVolState] = useState(getVolume());

  useEffect(() => { setSoundEnabled(soundOn); }, [soundOn]);
  useEffect(() => { setVolume(volume); }, [volume]);

  const unread = entries.filter((e) => !e.read).length;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) notificationsStore.markAllRead(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Notifications</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => notificationsStore.markAllRead()}
              disabled={unread === 0}
            >
              <Check className="h-3 w-3 mr-1" /> Mark read
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => notificationsStore.clear()}
              disabled={entries.length === 0}
            >
              <Trash2 className="h-3 w-3 mr-1" /> Clear
            </Button>
          </div>
        </div>
        <ScrollArea className="max-h-96">
          {entries.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <ul className="divide-y">
              {entries.map((e) => (
                <li key={e.id} className="px-3 py-2 flex gap-2">
                  <div className="pt-0.5">{iconFor(e.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight break-words">{e.title}</p>
                    {e.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">{e.description}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(e.createdAt, { addSuffix: true })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t px-3 py-2 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium">
              {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />}
              Notification sounds
            </div>
            <Switch checked={soundOn} onCheckedChange={setSoundOnState} />
          </div>
          <div className="flex items-center gap-2">
            <Slider
              value={[volume]}
              min={0}
              max={1}
              step={0.05}
              disabled={!soundOn}
              onValueChange={(v) => setVolState(v[0] ?? 0)}
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={!soundOn}
              onClick={() => playNotificationSound("info", volume)}
            >
              Test
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
