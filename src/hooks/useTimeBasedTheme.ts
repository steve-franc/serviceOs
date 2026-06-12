import { useEffect } from "react";

const PERIOD_KEY = "coreos-theme-period";
const THEME_KEY = "coreos-theme";

const currentPeriod = () => {
  const hour = new Date().getHours();
  return hour >= 18 || hour < 6 ? "night" : "day";
};

const applyAutoTheme = () => {
  const period = currentPeriod();
  const lastPeriod = localStorage.getItem(PERIOD_KEY);

  if (lastPeriod !== period) {
    // Period boundary crossed (or first run) — apply automatic theme,
    // overriding any manual toggle from the previous period.
    const isDark = period === "night";
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    localStorage.setItem(PERIOD_KEY, period);
  } else {
    // Same period as last automatic application — respect any manual
    // override stored in THEME_KEY.
    const manual = localStorage.getItem(THEME_KEY);
    if (manual === "dark" || manual === "light") {
      document.documentElement.classList.toggle("dark", manual === "dark");
    } else {
      const isDark = period === "night";
      document.documentElement.classList.toggle("dark", isDark);
    }
  }
};

export const useTimeBasedTheme = () => {
  useEffect(() => {
    applyAutoTheme();
    const interval = setInterval(applyAutoTheme, 60_000);
    return () => clearInterval(interval);
  }, []);
};
