import { ShoppingCart, Menu, History, Shield, Package, LogOut, UtensilsCrossed, Receipt, Users, BarChart3, LayoutDashboard, Store, UtensilsCrossed as ProductIcon } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const staffItems = [
  { title: "Create Order", url: "/order/create", icon: ShoppingCart },
  { title: "Tabs", url: "/tabs", icon: Receipt },
  { title: "Debtors", url: "/debtors", icon: Users },
  { title: "Orders", url: "/orders", icon: History },
];

const managerItems = [
  { title: "Menu", url: "/menu", icon: Menu },
  { title: "Inventory", url: "/inventory", icon: Package },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Admin", url: "/admin", icon: Shield },
];

// Ops can access menu management (no admin/reports/inventory)
const opsItems = [
  { title: "Menu", url: "/menu", icon: Menu },
];

// Observers (DB role: investor) get a strict read-only set:
// Reports + Admin only — no order taking, no edits.
const observerItems = [
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Admin", url: "/admin", icon: Shield },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { isManager, isInvestor, isOps, isSuperadmin } = useUserRole();
  const { restaurantName, logoUrl } = useRestaurantContext();

  // Superadmin items (God Mode)
  const superadminItems = [
    { title: "Dashboard", url: "/superadmin", icon: LayoutDashboard },
    { title: "Restaurants", url: "/superadmin/restaurants", icon: Store },
    { title: "Orders", url: "/superadmin/orders", icon: ShoppingCart },
    { title: "Analytics", url: "/superadmin/analytics", icon: BarChart3 },
    { title: "Products", url: "/superadmin/products", icon: ProductIcon },
  ];

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Failed to sign out");
    } else {
      toast.success("Signed out successfully");
      navigate("/");
    }
  };

  const isActive = (path: string) => location.pathname === path;

  // Superadmin gets only God Mode; observers see their reduced set; everyone else sees staff items.
  const primaryItems = isSuperadmin ? superadminItems : isInvestor ? observerItems : staffItems;
  const showManagement = !isSuperadmin && (isManager || isOps);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className={cn("flex items-center gap-3 px-2 py-3", collapsed && "justify-center")}>
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0 overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt={restaurantName || "Logo"} className="h-full w-full object-cover" />
            ) : (
              <UtensilsCrossed className="h-5 w-5 text-primary-foreground" />
            )}
          </div>
          {!collapsed && <h1 className="text-xl font-bold truncate">{restaurantName || "ServiceOS"}</h1>}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{isSuperadmin ? "Platform" : isInvestor ? "Observer" : "Navigation"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                  >
                    <NavLink to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showManagement && (
          <SidebarGroup>
            <SidebarGroupLabel>Management</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {(isManager ? managerItems : opsItems).map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                    >
                      <NavLink to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut} tooltip="Sign Out">
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
