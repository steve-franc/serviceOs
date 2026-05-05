import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useUserRole, useRestaurantAndRole } from "@/hooks/useRestaurantAndRole";
import { useLocation } from "react-router-dom";
import { useAlerts } from "@/hooks/useAlerts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { NotificationCenter } from "@/components/NotificationCenter";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const { hasRole } = useUserRole();
  const { restaurantStatus, isSuperadmin } = useRestaurantAndRole();
  const location = useLocation();
  useAlerts();

  const showSidebar =
    hasRole && !["/auth", "/", "/order"].includes(location.pathname) && !location.pathname.startsWith("/receipt/");

  const onHoldBanner =
    !isSuperadmin && restaurantStatus === "on_hold" ? (
      <Alert variant="destructive" className="mb-4 border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Restaurant on hold</AlertTitle>
        <AlertDescription>
          Your restaurant has been temporarily put on hold. Please contact support for assistance.
        </AlertDescription>
      </Alert>
    ) : null;

  if (!showSidebar) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 h-14 border-b flex items-center justify-end px-4 bg-card/95 backdrop-blur">
          <NotificationCenter />
        </header>
        <main className="container mx-auto px-4 py-8">
          {onHoldBanner}
          {children}
        </main>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="h-screen flex w-full overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-40 h-14 border-b flex items-center justify-between px-4 bg-card/95 backdrop-blur shrink-0">
            <SidebarTrigger />
            <NotificationCenter />
          </header>
          <main className="flex-1 p-6 overflow-auto">
            {onHoldBanner}
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Layout;
