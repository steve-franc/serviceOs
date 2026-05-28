import { ReactNode, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Home, Zap, Package, CreditCard, Settings, ShoppingCart, History, CalendarClock, Receipt,
  Users, Menu as MenuIcon, Truck, BarChart3, Shield, ChevronRight, X, Plus, Sun, Moon,
  LogOut, LayoutDashboard, Store, UtensilsCrossed as ProductIcon, Megaphone, Crown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole, useRestaurantAndRole } from "@/hooks/useRestaurantAndRole";
import { useRestaurantContext } from "@/hooks/useRestaurantContext";
import { useAlerts } from "@/hooks/useAlerts";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type SubTab = { label: string; path: string; icon: any; badge?: number; badgeKind?: "default" | "warn" | "danger" };
type Section = { id: string; label: string; icon: any; path?: string; subtabs?: SubTab[]; roles?: string[] };

const BUSINESS_SECTIONS: Section[] = [
  { id: "overview", label: "Overview", icon: Home, path: "/dashboard" },
  {
    id: "operations", label: "Operations", icon: Zap,
    subtabs: [
      { label: "Create Order", path: "/order/create", icon: ShoppingCart },
      { label: "Orders", path: "/orders", icon: History },
      { label: "Bookings", path: "/bookings", icon: CalendarClock },
      { label: "Tabs", path: "/tabs", icon: Receipt },
      { label: "Debtors", path: "/debtors", icon: Users, badgeKind: "warn" },
    ],
  },
  {
    id: "inventory", label: "Inventory & Supply", icon: Package,
    subtabs: [
      { label: "Menu", path: "/menu", icon: MenuIcon },
      { label: "Inventory", path: "/inventory", icon: Package },
      { label: "Supply", path: "/restock", icon: Truck },
    ],
  },
  {
    id: "finance", label: "Finance", icon: CreditCard,
    subtabs: [
      { label: "Billing", path: "/billing", icon: CreditCard },
      { label: "Reports", path: "/reports", icon: BarChart3 },
    ],
  },
  {
    id: "settings", label: "Settings & Admin", icon: Settings,
    subtabs: [{ label: "Admin", path: "/admin", icon: Shield }],
  },
];

const SUPER_SECTIONS: Section[] = [
  { id: "super-dash", label: "Dashboard", icon: LayoutDashboard, path: "/superadmin" },
  { id: "super-biz", label: "Businesses", icon: Store, path: "/superadmin/restaurants" },
  { id: "super-users", label: "Users", icon: Users, path: "/superadmin/users" },
  { id: "super-orders", label: "Orders", icon: ShoppingCart, path: "/superadmin/orders" },
  { id: "super-analytics", label: "Analytics", icon: BarChart3, path: "/superadmin/analytics" },
  { id: "super-products", label: "Products", icon: ProductIcon, path: "/superadmin/products" },
  { id: "super-broadcasts", label: "Broadcasts", icon: Megaphone, path: "/superadmin/broadcasts" },
  { id: "super-subs", label: "Subscriptions", icon: CreditCard, path: "/superadmin/subscriptions" },
];

function filterForRole(sections: Section[], role: { isManager: boolean; isOps: boolean; isInvestor: boolean }): Section[] {
  if (role.isManager) return sections;
  if (role.isInvestor) {
    return sections.filter(s => s.id === "finance" || s.id === "settings").map(s =>
      s.id === "finance" ? { ...s, subtabs: s.subtabs?.filter(st => st.path === "/reports") } : s,
    );
  }
  if (role.isOps) {
    return sections
      .filter(s => ["operations", "inventory"].includes(s.id))
      .map(s => s.id === "inventory" ? { ...s, subtabs: s.subtabs?.filter(st => st.path === "/menu") } : s);
  }
  // server/counter/no role → staff items
  return sections.filter(s => s.id === "operations");
}

function findActiveSection(sections: Section[], pathname: string): { section?: Section; subtab?: SubTab } {
  for (const s of sections) {
    if (s.path && s.path === pathname) return { section: s };
    const sub = s.subtabs?.find(st => pathname === st.path || pathname.startsWith(st.path + "/"));
    if (sub) return { section: s, subtab: sub };
  }
  return {};
}

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem("coreos-theme") as "light" | "dark") ||
      (document.documentElement.classList.contains("dark") ? "dark" : "light");
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("coreos-theme", theme);
  }, [theme]);
  return { theme, toggle: () => setTheme(t => t === "dark" ? "light" : "dark") };
}

function SidebarBody({
  sections, pathname, collapsed, onNavigate, isSuperNav,
}: { sections: Section[]; pathname: string; collapsed: boolean; onNavigate?: () => void; isSuperNav?: boolean }) {
  const { section: activeSection } = findActiveSection(sections, pathname);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    sections.forEach(s => { if (s.id === activeSection?.id) o[s.id] = true; });
    return o;
  });
  useEffect(() => {
    if (activeSection) setOpen(o => ({ ...o, [activeSection.id]: true }));
  }, [activeSection?.id]);

  return (
    <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 py-3 space-y-0.5">
      {sections.map(s => {
        const isActive = activeSection?.id === s.id;
        const hasSubs = !!s.subtabs?.length;
        const isOpen = !!open[s.id];

        if (!hasSubs) {
          return (
            <NavLink
              key={s.id}
              to={s.path!}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors duration-150 min-h-[40px]",
                "hover:bg-bg3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                isActive ? "text-brand font-semibold" : "text-foreground/80",
                collapsed && "justify-center",
              )}
              aria-label={s.label}
            >
              <s.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{s.label}</span>}
            </NavLink>
          );
        }

        return (
          <div key={s.id}>
            <button
              type="button"
              onClick={() => setOpen(o => ({ ...o, [s.id]: !o[s.id] }))}
              className={cn(
                "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors duration-150 min-h-[40px]",
                "hover:bg-bg3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                isActive ? "text-brand font-semibold" : "text-foreground/80",
                collapsed && "justify-center",
              )}
              aria-expanded={isOpen}
              aria-label={s.label}
            >
              <s.icon className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left truncate">{s.label}</span>
                  <ChevronRight
                    className={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen && "rotate-90")}
                  />
                </>
              )}
            </button>
            {!collapsed && isOpen && (
              <div className="ml-4 mt-0.5 mb-1 pl-3 border-l border-border space-y-0.5">
                {s.subtabs!.map(st => {
                  const subActive = pathname === st.path || pathname.startsWith(st.path + "/");
                  return (
                    <NavLink
                      key={st.path}
                      to={st.path}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors duration-150 min-h-[36px]",
                        "hover:bg-bg3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                        subActive
                          ? "bg-brand/[0.18] text-brand font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      <st.icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1 truncate">{st.label}</span>
                      {st.badge != null && (
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                          st.badgeKind === "warn" && "bg-accent3/20 text-accent3",
                          st.badgeKind === "danger" && "bg-danger/20 text-danger",
                          (!st.badgeKind || st.badgeKind === "default") && "bg-brand/15 text-brand",
                        )}>{st.badge}</span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function UserFooter({ collapsed, theme, onToggleTheme, onSignOut, name, role }: {
  collapsed: boolean; theme: "light" | "dark"; onToggleTheme: () => void;
  onSignOut: () => void; name: string; role: string;
}) {
  const initials = name.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "S";
  return (
    <div className="border-t border-border p-2 space-y-1">
      <div className={cn("flex items-center gap-2 px-1.5 py-1.5 rounded-md", collapsed && "justify-center")}>
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand to-accent2 text-white text-xs font-bold grid place-items-center shrink-0">
          {initials}
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{name}</p>
            <p className="text-[10px] text-muted-foreground truncate capitalize">{role}</p>
          </div>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            className="p-1.5 rounded-md hover:bg-bg3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onSignOut}
        aria-label="Sign out"
        className={cn(
          "w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:bg-bg3 hover:text-foreground transition-colors min-h-[40px]",
          collapsed && "justify-center",
        )}
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {!collapsed && <span>Sign Out</span>}
      </button>
    </div>
  );
}

export default function AppShell({ children }: { children?: ReactNode }) {
  const content = children ?? <Outlet />;
  const location = useLocation();
  const navigate = useNavigate();
  const { hasRole, isManager, isOps, isInvestor, isSuperadmin } = useUserRole();
  const { restaurantStatus, isSuperadminAccount, godModeDisabled, setGodModeDisabled, user } =
    useRestaurantAndRole();
  const { restaurantName, logoUrl } = useRestaurantContext();
  const { theme, toggle } = useTheme();
  useAlerts();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      setIsMobile(w < 768);
      setIsTablet(w >= 768 && w < 1024);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  // Pages that don't get the shell
  const hideShell =
    !hasRole ||
    ["/auth", "/"].includes(location.pathname) ||
    location.pathname.startsWith("/order/") && location.pathname !== "/order/create" ||
    location.pathname.startsWith("/receipt/");

  const sections = useMemo(() => {
    if (isSuperadmin) return SUPER_SECTIONS;
    return filterForRole(BUSINESS_SECTIONS, { isManager, isOps, isInvestor });
  }, [isSuperadmin, isManager, isOps, isInvestor]);

  const { section: activeSection, subtab: activeSubtab } = findActiveSection(sections, location.pathname);
  const pageTitle = activeSection
    ? activeSubtab ? `${activeSection.label} — ${activeSubtab.label}` : activeSection.label
    : "CoreOS";

  const onHoldBanner =
    !isSuperadmin && restaurantStatus === "on_hold" ? (
      <Alert variant="destructive" className="mb-4 border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Business on hold</AlertTitle>
        <AlertDescription>
          Your business has been temporarily put on hold. Please contact support for assistance.
        </AlertDescription>
      </Alert>
    ) : null;

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error("Failed to sign out");
    else { toast.success("Signed out successfully"); navigate("/"); }
  };

  if (hideShell) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 h-14 border-b flex items-center justify-end px-4 bg-card/95 backdrop-blur">
          <NotificationCenter />
        </header>
        <main className="container mx-auto px-4 py-8">
          {onHoldBanner}
          {content}
        </main>
      </div>
    );
  }

  const sidebarCollapsed = isTablet;
  const userName = (user?.user_metadata?.full_name as string) || user?.email?.split("@")[0] || "User";
  const roleLabel = isSuperadmin ? "Superadmin" : isManager ? "Manager" : isOps ? "Ops" : isInvestor ? "Observer" : "Staff";

  const SidebarLogo = (
    <div className="h-14 border-b border-border flex items-center px-3 gap-2.5 shrink-0">
      <div className="h-[30px] w-[30px] rounded-md bg-brand text-white grid place-items-center font-bold text-sm overflow-hidden shrink-0">
        {logoUrl ? <img src={logoUrl} alt={restaurantName || "Logo"} className="h-full w-full object-cover" /> : "S"}
      </div>
      {!sidebarCollapsed && (
        <>
          <span className="font-bold text-[15px] tracking-tight truncate">{restaurantName || "coreOS"}</span>
          <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-brand/15 text-brand">Pro</span>
        </>
      )}
    </div>
  );

  const GodModeToggle = isSuperadminAccount && !sidebarCollapsed ? (
    <div className="mx-2 mb-1 flex items-center justify-between gap-2 px-2 py-2 rounded-md bg-accent3/10 border border-accent3/30">
      <div className="flex items-center gap-2 min-w-0">
        <Crown className="h-3.5 w-3.5 text-accent3 shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold leading-tight">God Mode</p>
          <p className="text-[9px] text-muted-foreground leading-tight truncate">
            {godModeDisabled ? "Acting as business" : "Platform-wide"}
          </p>
        </div>
      </div>
      <Switch
        checked={!godModeDisabled}
        onCheckedChange={(on) => { setGodModeDisabled(!on); navigate(on ? "/superadmin" : "/dashboard", { replace: true }); }}
      />
    </div>
  ) : null;

  return (
    <div className="h-dvh w-full flex bg-bg1 text-foreground overflow-hidden">
      {/* Desktop / tablet sidebar */}
      {!isMobile && (
        <aside
          className={cn(
            "shrink-0 border-r border-border bg-bg2 flex flex-col transition-[width] duration-200",
            sidebarCollapsed ? "w-[60px]" : "w-[230px]",
          )}
        >
          {SidebarLogo}
          <SidebarBody sections={sections} pathname={location.pathname} collapsed={sidebarCollapsed} />
          {GodModeToggle}
          <UserFooter
            collapsed={sidebarCollapsed}
            theme={theme} onToggleTheme={toggle}
            onSignOut={handleSignOut} name={userName} role={roleLabel}
          />
        </aside>
      )}

      {/* Mobile drawer */}
      {isMobile && (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            className={cn(
              "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200",
              drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
            aria-hidden="true"
          />
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-[85%] max-w-[300px] border-r border-border bg-bg2 flex flex-col transition-transform duration-[250ms]",
              drawerOpen ? "translate-x-0" : "-translate-x-full",
            )}
            aria-hidden={!drawerOpen}
          >
            <div className="h-14 border-b border-border flex items-center px-3 gap-2.5">
              <div className="h-[30px] w-[30px] rounded-md bg-brand text-white grid place-items-center font-bold text-sm overflow-hidden">
                {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-cover" /> : "S"}
              </div>
              <span className="font-bold text-[15px] tracking-tight truncate">{restaurantName || "coreOS"}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-brand/15 text-brand">Pro</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="ml-auto p-1.5 rounded-md hover:bg-bg3 min-h-11 min-w-11 grid place-items-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarBody
              sections={sections} pathname={location.pathname}
              collapsed={false} onNavigate={() => setDrawerOpen(false)}
            />
            {GodModeToggle}
            <UserFooter
              collapsed={false} theme={theme} onToggleTheme={toggle}
              onSignOut={handleSignOut} name={userName} role={roleLabel}
            />
          </aside>
        </>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-[58px] shrink-0 border-b border-border bg-bg2 flex items-center gap-3 px-3 sm:px-4">
          {isMobile && (
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
              className="p-2 rounded-md hover:bg-bg3 min-h-11 min-w-11 grid place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
          )}
          <h1 className="text-[15px] font-semibold truncate flex-1 min-w-0">
            {pageTitle}
          </h1>


          <div className="ml-auto flex items-center gap-2">
            {!isSuperadmin && (
              <button
                type="button"
                onClick={() => navigate("/order/create")}
                className="hidden sm:inline-flex items-center gap-1.5 bg-brand text-white text-[13px] font-semibold px-3 h-9 rounded-lg hover:bg-brand/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                <Plus className="h-4 w-4" />
                New Order
              </button>
            )}
            <NotificationCenter />
          </div>
        </header>

        {/* Breadcrumb */}
        {activeSection && (
          <div className="px-4 sm:px-6 pt-2.5 text-[12px] text-muted-foreground flex items-center gap-1.5">
            <span>coreOS</span>
            <ChevronRight className="h-3 w-3 opacity-60" />
            <span>{activeSection.label}</span>
            {activeSubtab && (
              <>
                <ChevronRight className="h-3 w-3 opacity-60" />
                <span className="text-foreground/80">{activeSubtab.label}</span>
              </>
            )}
          </div>
        )}

        {/* Content */}
        <main className="flex-1 overflow-auto scrollbar-thin px-4 py-4 sm:px-6 sm:py-5">
          {onHoldBanner}
          {content}
        </main>
      </div>
    </div>
  );
}
