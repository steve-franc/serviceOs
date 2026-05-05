import { toast } from "sonner";
import { notificationsStore, type NotificationType } from "@/stores/notifications";

// Monkey-patch sonner's toast singleton so every notification is captured
// in the persistent inbox (top-right bell), regardless of caller.
let installed = false;

function extractTitleAndDesc(args: unknown[]): { title: string; description?: string } {
  const [first, second] = args;
  let title = "";
  let description: string | undefined;
  if (typeof first === "string" || typeof first === "number") title = String(first);
  else if (first && typeof first === "object" && "toString" in (first as object)) title = String(first);
  if (second && typeof second === "object") {
    const opts = second as { description?: unknown };
    if (typeof opts.description === "string") description = opts.description;
  }
  return { title, description };
}

function wrap(method: NotificationType, _original: (...args: any[]) => any) {
  return (...args: any[]) => {
    const { title, description } = extractTitleAndDesc(args);
    if (title) notificationsStore.push(method, title, description);
    // Toasts are silenced — everything routes to the notification center.
    return "" as any;
  };
}

export function installNotificationInbox() {
  if (installed) return;
  installed = true;
  const t = toast as unknown as Record<string, any>;
  const baseFn = toast as unknown as (...args: any[]) => any;
  const originalBase = baseFn.bind(toast);

  // Wrap the callable itself (toast("..."))
  const wrappedBase = wrap("message", originalBase);
  // Copy properties from original toast onto wrapped function
  Object.keys(t).forEach((k) => {
    (wrappedBase as any)[k] = t[k];
  });

  (["success", "error", "info", "warning", "message"] as const).forEach((m) => {
    if (typeof t[m] === "function") {
      const original = t[m].bind(toast);
      t[m] = wrap(m, original);
    }
  });
}
