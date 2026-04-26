import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface SmartBackButtonProps {
  /** Fallback route if no in-app history is available. Defaults to /orders (the main dashboard hub for staff). */
  fallback?: string;
  variant?: "ghost" | "outline" | "default";
  size?: "icon" | "sm" | "default";
  label?: string;
  className?: string;
}

/**
 * Always returns to the previous in-app dashboard page.
 * - If browser history has an entry from inside the app, go back one step.
 * - Otherwise navigate to the provided fallback (default /orders).
 */
export function SmartBackButton({
  fallback = "/orders",
  variant = "ghost",
  size = "icon",
  label,
  className,
}: SmartBackButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = () => {
    // history.idx > 0 means we have an entry to go back to in this SPA session.
    // window.history.length > 1 is a weaker but acceptable signal in practice.
    const hasInAppHistory =
      // @ts-ignore - non-standard but populated by react-router v6
      (window.history.state && typeof window.history.state.idx === "number" && window.history.state.idx > 0) ||
      window.history.length > 1;

    if (hasInAppHistory && location.key !== "default") {
      navigate(-1);
      return;
    }
    navigate(fallback, { replace: true });
  };

  return (
    <Button variant={variant} size={size} onClick={handleClick} className={className} aria-label="Go back">
      <ArrowLeft className="h-4 w-4" />
      {label && <span className="ml-2">{label}</span>}
    </Button>
  );
}

export default SmartBackButton;
