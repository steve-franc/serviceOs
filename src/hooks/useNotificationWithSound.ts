import { useCallback } from "react";
import { toast } from "sonner";
import { playNotificationSound, type SoundType } from "@/hooks/useSoundNotification";
import { getSoundEnabled, getVolume } from "@/lib/notification-prefs";

export type NotifyType = SoundType;

export interface NotifyOptions {
  /** Force-enable or disable sound for this notification (overrides global setting). */
  sound?: boolean;
  /** Volume override (0-1). Falls back to user-saved preference. */
  volume?: number;
  /** Optional secondary description for the toast. */
  description?: string;
}

/**
 * Drop-in replacement for direct `toast.*` calls that also plays a notification
 * sound according to the user's preferences (localStorage-backed).
 */
export function useNotificationWithSound() {
  const notify = useCallback(
    (type: NotifyType, message: string, options: NotifyOptions = {}) => {
      const { sound, volume, description } = options;

      // Show the toast (falls back to info for "info").
      const toastFn =
        type === "success"
          ? toast.success
          : type === "error"
            ? toast.error
            : type === "warning"
              ? toast.warning
              : toast.info;
      toastFn(message, description ? { description } : undefined);

      const shouldPlay = sound ?? getSoundEnabled();
      if (shouldPlay) {
        const vol = typeof volume === "number" ? volume : getVolume();
        playNotificationSound(type, vol);
      }
    },
    []
  );

  return { notify };
}
