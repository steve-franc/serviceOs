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
let entries: NotificationEntry[] = [];
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export const notificationsStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot() {
    return entries;
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
    emit();
  },
  markAllRead() {
    if (entries.every((e) => e.read)) return;
    entries = entries.map((e) => ({ ...e, read: true }));
    emit();
  },
  clear() {
    entries = [];
    emit();
  },
  unreadCount() {
    return entries.filter((e) => !e.read).length;
  },
};

export function useNotifications() {
  return useSyncExternalStore(notificationsStore.subscribe, notificationsStore.getSnapshot, notificationsStore.getSnapshot);
}
