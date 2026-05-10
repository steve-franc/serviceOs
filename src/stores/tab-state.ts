import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Per-tab state store. Each "tab" is identified by a string key
 * (typically the route pathname). Each tab holds an arbitrary bag
 * of state slices: filters, search, scroll position, form drafts, etc.
 *
 * Persisted to sessionStorage so state survives reloads within a session
 * but is cleared when the browser tab closes.
 */
type TabBag = Record<string, unknown>;

interface TabStateStore {
  tabs: Record<string, TabBag>;
  getSlice: <T>(tabId: string, key: string, fallback: T) => T;
  setSlice: (tabId: string, key: string, value: unknown) => void;
  clearTab: (tabId: string) => void;
  clearAll: () => void;
}

export const useTabStateStore = create<TabStateStore>()(
  persist(
    (set, get) => ({
      tabs: {},
      getSlice: <T,>(tabId: string, key: string, fallback: T): T => {
        const bag = get().tabs[tabId];
        if (!bag || !(key in bag)) return fallback;
        return bag[key] as T;
      },
      setSlice: (tabId, key, value) =>
        set((state) => {
          const prev = state.tabs[tabId] ?? {};
          if (prev[key] === value) return state;
          return {
            tabs: { ...state.tabs, [tabId]: { ...prev, [key]: value } },
          };
        }),
      clearTab: (tabId) =>
        set((state) => {
          if (!(tabId in state.tabs)) return state;
          const next = { ...state.tabs };
          delete next[tabId];
          return { tabs: next };
        }),
      clearAll: () => set({ tabs: {} }),
    }),
    {
      name: "tab-state",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

/** Parse a composite "tabId:sliceKey" key (back-compat with old callers). */
function splitKey(key: string): { tabId: string; slice: string } {
  const idx = key.indexOf(":");
  if (idx === -1) return { tabId: "_global", slice: key };
  return { tabId: key.slice(0, idx), slice: key.slice(idx + 1) };
}

/** Convenience helpers used by usePersistentState / useScrollRestoration. */
export function loadSlice<T>(key: string, fallback: T): T {
  const { tabId, slice } = splitKey(key);
  return useTabStateStore.getState().getSlice(tabId, slice, fallback);
}

export function saveSlice(key: string, value: unknown) {
  const { tabId, slice } = splitKey(key);
  useTabStateStore.getState().setSlice(tabId, slice, value);
}
