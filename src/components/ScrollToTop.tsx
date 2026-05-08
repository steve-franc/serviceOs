import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

const ScrollToTop = () => {
  const { pathname } = useLocation();
  const navType = useNavigationType();

  // Restore scroll on POP navigation (back/forward).
  useScrollRestoration();

  useEffect(() => {
    // Only scroll to top for forward navigation, so back-button restoration works.
    if (navType === "POP") return;
    window.scrollTo(0, 0);
  }, [pathname, navType]);

  return null;
};

export default ScrollToTop;
