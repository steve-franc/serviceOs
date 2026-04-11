import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useUserRole } from "@/hooks/useUserRole";
import { useLocation } from "react-router-dom";
import { useAlerts } from "@/hooks/useAlerts";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const { hasRole } = useUserRole();
  const location = useLocation();
  useAlerts();

  const showSidebar =
    hasRole && !["/auth", "/", "/order"].includes(location.pathname) && !location.pathname.startsWith("/receipt/");

  if (!showSidebar) {
    return (
      <div className="min-h-screen bg-background">
        <main className="container mx-auto px-4 py-8">{children}</main>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b flex items-center px-4 bg-card">
            <SidebarTrigger />
          </header>
          <main className="flex-1 p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Layout;
