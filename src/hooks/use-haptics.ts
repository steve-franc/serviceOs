/**
 * Lightweight haptics helper for mobile browsers.
 * Uses the Web Vibration API when available.
 */
export function useHaptics() {
  const vibrate = (pattern: number | number[]) => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav: any = navigator;
    if (typeof nav?.vibrate === "function") {
      nav.vibrate(pattern);
    }
  };

  /** Subtle tap confirmation. */
  const tap = () => vibrate(10);

  /** Slightly stronger confirmation. */
  const success = () => vibrate([10, 20, 10]);

  return { tap, success };
}
