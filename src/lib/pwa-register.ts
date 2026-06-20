// Guarded service worker registration. Never registers in dev, Lovable
// preview iframes, or when `?sw=off` is present. Cleans up stale SWs in
// those contexts so previews never serve stale HTML.

const SW_URL = "/sw.js";

function shouldSkip(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com"))
    return true;
  if (
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com")
  )
    return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev"))
    return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off")
    return true;
  return false;
}

async function unregisterMatching() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
          return url.endsWith(SW_URL);
        })
        .map((r) => r.unregister()),
    );
  } catch {
    /* ignore */
  }
}

export function registerPWA() {
  if (shouldSkip()) {
    void unregisterMatching();
    return;
  }
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SW_URL).catch(() => {
      /* ignore registration errors */
    });
  });
}
