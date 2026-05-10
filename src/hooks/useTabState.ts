import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useTabStateStore } from "@/stores/tab-state";

/**
 * Hook for accessing the current route's tab-state bag.
 *
 * ```tsx
 * const [filters, setFilters] = useTabState("filters", { status: "all" });
 * const [scroll, setScroll]   = useTabState<number>("scroll", 0);
 * ```
 *
 * State is keyed by the current pathname, persists across in-app navigation,
 * and survives reloads within the browser session (sessionStorage).
 */
export function useTabState<T>(slice: string, fallback: T) {
  const { pathname } = useLocation();
  return useTabStateForId<T>(pathname, slice, fallback);
}

/** Same as useTabState but with an explicit tab id (handy for cross-route shared bags). */
export function useTabStateForId<T>(tabId: string, slice: string, fallback: T) {
  const value = useTabStateStore((s) => {
    const bag = s.tabs[tabId];
    if (!bag || !(slice in bag)) return fallback;
    return bag[slice] as T;
  });

  const setSlice = useTabStateStore((s) => s.setSlice);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === "function"
          ? (next as (prev: T) => T)(value)
          : next;
      setSlice(tabId, slice, resolved);
    },
    [setSlice, tabId, slice, value],
  );

  return [value, setValue] as const;
}
