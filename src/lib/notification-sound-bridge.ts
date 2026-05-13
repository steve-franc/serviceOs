import { playNotificationSound, type SoundType } from "@/hooks/useSoundNotification";
import { getSoundEnabled, getVolume } from "@/lib/notification-prefs";
import type { NotificationType } from "@/stores/notifications";

const MAP: Record<NotificationType, SoundType> = {
  success: "success",
  error: "error",
  warning: "warning",
  info: "info",
  message: "info",
};

export function playForType(type: NotificationType) {
  if (!getSoundEnabled()) return;
  playNotificationSound(MAP[type], getVolume());
}
