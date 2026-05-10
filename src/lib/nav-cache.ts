// Thin compatibility layer over the Zustand tab-state store.
// New code should prefer `useTabState` from "@/hooks/useTabState".
import { loadSlice, saveSlice, useTabStateStore } from "@/stores/tab-state";

export function saveState(key: string, value: unknown) {
  saveSlice(key, value);
}

export function loadState<T>(key: string, fallback: T): T {
  return loadSlice<T>(key, fallback);
}

export function clearAllNavCache() {
  useTabStateStore.getState().clearAll();
}
