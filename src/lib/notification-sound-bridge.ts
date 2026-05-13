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

// Order-related notifications use the dedicated loud alarm chime in
// `src/components/NotificationSound.tsx`. Skip the generic success/info ding
// here so the two sounds don't overlap and the order alert stays distinct.
function isIncomingOrder(title?: string) {
  if (!title) return false;
  const t = title.toLowerCase();
  return t.includes("new online order") || t.includes("new order from");
}

export function playForType(type: NotificationType, title?: string) {
  if (!getSoundEnabled()) return;
  if (isIncomingOrder(title)) return; // dedicated alarm handles this
  playNotificationSound(MAP[type], getVolume());
}
