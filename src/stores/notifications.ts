import { useSyncExternalStore } from "react";

export type NotificationType = "success" | "error" | "info" | "warning" | "message";

export interface NotificationEntry {
  id: string;
  type: NotificationType;
  title: string;
  description?: string;
  createdAt: number;
  read: boolean;
}

const MAX = 50;
const STORAGE_PREFIX = "notifications:v1:";
const ANON_KEY = "__anon__";

let activeUserId: string | null = null;
let entries: NotificationEntry[] = [];
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

const storageKey = (userId: string | null) => STORAGE_PREFIX + (userId ?? ANON_KEY);

const loadFromStorage = (userId: string | null): NotificationEntry[] => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
};

const saveToStorage = () => {
  try {
    localStorage.setItem(storageKey(activeUserId), JSON.stringify(entries));
  } catch {
    /* noop */
  }
};

export const notificationsStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot() {
    return entries;
  },
  setActiveUser(userId: string | null) {
    if (activeUserId === userId) return;
    activeUserId = userId;
    entries = loadFromStorage(userId);
    emit();
  },
  push(type: NotificationType, title: string, description?: string) {
    if (!title || typeof title !== "string") return;
    const entry: NotificationEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      title,
      description,
      createdAt: Date.now(),
      read: false,
    };
    entries = [entry, ...entries].slice(0, MAX);
    saveToStorage();
    emit();
    // Play sound (respects user preferences). Lazy-imported to avoid cycles.
    void import("@/lib/notification-sound-bridge").then((m) => m.playForType(type, title));
  },
  markAllRead() {
    if (entries.every((e) => e.read)) return;
    entries = entries.map((e) => ({ ...e, read: true }));
    saveToStorage();
    emit();
  },
  clear() {
    entries = [];
    saveToStorage();
    emit();
  },
  unreadCount() {
    return entries.filter((e) => !e.read).length;
  },
};

export function useNotifications() {
  return useSyncExternalStore(notificationsStore.subscribe, notificationsStore.getSnapshot, notificationsStore.getSnapshot);
}
