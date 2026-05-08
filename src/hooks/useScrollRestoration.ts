import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { loadState, saveState } from "@/lib/nav-cache";

const SCROLL_PREFIX = "scroll:";

/**
 * Restores window scroll position on POP navigations (browser/app back).
 * Saves scroll position before unloading or navigating away.
 *
 * Use once near the app shell. Pairs with ScrollToTop, which only resets
 * on PUSH/REPLACE (forward) navigations.
 */
export function useScrollRestoration() {
  const { pathname, search } = useLocation();
  const navType = useNavigationType();
  const key = SCROLL_PREFIX + pathname + search;

  // Save on navigate away / unload.
  useEffect(() => {
    const save = () => saveState(key, window.scrollY);
    window.addEventListener("beforeunload", save);
    return () => {
      save();
      window.removeEventListener("beforeunload", save);
    };
  }, [key]);

  // Restore on back/forward.
  useEffect(() => {
    if (navType !== "POP") return;
    const y = loadState<number>(key, 0);
    // Wait a tick for the page content to mount.
    const t = window.setTimeout(() => window.scrollTo(0, y), 0);
    return () => window.clearTimeout(t);
  }, [key, navType]);
}
