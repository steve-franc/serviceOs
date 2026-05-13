import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Volume2 } from "lucide-react";
import {
  getSoundEnabled,
  setSoundEnabled,
  getVolume,
  setVolume,
} from "@/lib/notification-prefs";
import { playNotificationSound } from "@/hooks/useSoundNotification";

export function NotificationSettings() {
  const [enabled, setEnabled] = useState(getSoundEnabled());
  const [volume, setVol] = useState(getVolume());

  useEffect(() => {
    setSoundEnabled(enabled);
  }, [enabled]);

  useEffect(() => {
    setVolume(volume);
  }, [volume]);

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div>
        <h3 className="text-base font-semibold text-foreground">Notification sounds</h3>
        <p className="text-sm text-muted-foreground">
          Play a short chime when notifications appear.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="notif-sound-toggle" className="text-sm font-medium text-foreground">
          Enable sounds
        </Label>
        <Switch
          id="notif-sound-toggle"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium text-foreground">Volume</Label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {Math.round(volume * 100)}%
          </span>
        </div>
        <Slider
          value={[volume]}
          min={0}
          max={1}
          step={0.05}
          disabled={!enabled}
          onValueChange={(v) => setVol(v[0] ?? 0)}
        />
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!enabled}
        onClick={() => playNotificationSound("info", volume)}
        className="gap-2"
      >
        <Volume2 className="h-4 w-4" />
        Test sound
      </Button>
    </div>
  );
}

export default NotificationSettings;
