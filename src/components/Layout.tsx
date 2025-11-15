import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, UtensilsCrossed, ShoppingCart, Menu, History, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
interface LayoutProps {
  children: ReactNode;
}
const Layout = ({
  children
}: LayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    isAdmin,
    isRestaurant
  } = useUserRole();
  const handleSignOut = async () => {
    const {
      error
    } = await supabase.auth.signOut();
    if (error) {
      toast.error("Failed to sign out");
    } else {
      toast.success("Signed out successfully");
      navigate("/auth");
    }
  };
  const getCurrentTab = () => {
    if (location.pathname === "/order/create") return "create-order";
    if (location.pathname === "/menu") return "menu";
    if (location.pathname === "/orders") return "orders";
    if (location.pathname === "/admin") return "admin";
    return "dashboard";
  };
  const handleTabChange = (value: string) => {
    if (value === "create-order") navigate("/order/create");else if (value === "menu") navigate("/menu");else if (value === "orders") navigate("/orders");else if (value === "admin") navigate("/admin");else navigate("/");
  };
  const showNavigation = !["/auth", "/"].includes(location.pathname) && !location.pathname.startsWith("/receipt/");
  return <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-[var(--shadow-soft)]">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <UtensilsCrossed className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold">Tablix</h1>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
        {showNavigation && <div className="container mx-auto px-4 pb-4">
            <Tabs value={getCurrentTab()} onValueChange={handleTabChange}>
              <TabsList className={`grid w-full max-w-2xl mx-auto ${isAdmin ? 'grid-cols-4' : (isRestaurant ? 'grid-cols-3' : 'grid-cols-2')}`}>
                <TabsTrigger value="create-order" className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Order</span>
                </TabsTrigger>
                {(isRestaurant || isAdmin) && <TabsTrigger value="menu" className="flex items-center gap-2">
                  <Menu className="h-4 w-4" />
                  <span className="hidden sm:inline">Menu</span>
                </TabsTrigger>}
                <TabsTrigger value="orders" className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  <span className="hidden sm:inline">Orders</span>
                </TabsTrigger>
                {isAdmin && <TabsTrigger value="admin" className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </TabsTrigger>}
              </TabsList>
            </Tabs>
          </div>}
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>;
};
export default Layout;