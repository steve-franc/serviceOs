import { useEffect, useState } from "react";
import { loadState, saveState } from "@/lib/nav-cache";

/**
 * Drop-in replacement for useState that persists the value to sessionStorage
 * keyed by the provided cache key. Useful for filters, search queries and
 * collapsed/expanded UI state that should survive in-app navigation.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => loadState<T>(key, initial));

  useEffect(() => {
    saveState(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
