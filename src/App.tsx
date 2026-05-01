import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth, RestaurantRoleProvider } from "./hooks/useRestaurantAndRole";
import { NotificationSound } from "./components/NotificationSound";
import ScrollToTop from "./components/ScrollToTop";
import { useTimeBasedTheme } from "./hooks/useTimeBasedTheme";
import { useAutoEndDay } from "./hooks/useAutoEndDay";

// Lazy-load all pages for faster initial load
const Auth = lazy(() => import("./pages/Auth"));
const Landing = lazy(() => import("./pages/Landing"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const MenuManagement = lazy(() => import("./pages/MenuManagement"));
const CreateOrder = lazy(() => import("./pages/CreateOrder"));
const OrderHistory = lazy(() => import("./pages/OrderHistory"));
const Receipt = lazy(() => import("./pages/Receipt"));
const Admin = lazy(() => import("./pages/Admin"));
const PublicOrder = lazy(() => import("./pages/PublicOrder"));
const Inventory = lazy(() => import("./pages/Inventory"));
const TabsPage = lazy(() => import("./pages/Tabs"));
const ReportBreakdown = lazy(() => import("./pages/ReportBreakdown"));
const Debtors = lazy(() => import("./pages/Debtors"));
const Reports = lazy(() => import("./pages/Reports"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SuperDashboard = lazy(() => import("./pages/superadmin/Dashboard"));
const SuperRestaurants = lazy(() => import("./pages/superadmin/Restaurants"));
const SuperRestaurantDetail = lazy(() => import("./pages/superadmin/RestaurantDetail"));
const SuperOrders = lazy(() => import("./pages/superadmin/Orders"));
const SuperAnalytics = lazy(() => import("./pages/superadmin/Analytics"));
const SuperProducts = lazy(() => import("./pages/superadmin/Products"));
const SuperUsers = lazy(() => import("./pages/superadmin/Users"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      retry: 1,
    },
  },
});

import { useUserRole } from "./hooks/useRestaurantAndRole";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

// Observers (DB role: investor) are read-only — they can only access /reports and /admin.
// Superadmins are global and routed to /superadmin.
const ObserverBlockedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { isInvestor, isSuperadmin, loading: roleLoading } = useUserRole();

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (isSuperadmin) return <Navigate to="/superadmin" replace />;
  if (isInvestor) return <Navigate to="/reports" replace />;
  return <>{children}</>;
};

const SuperadminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperadmin, loading: roleLoading } = useUserRole();
  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperadmin) return <Navigate to="/order/create" replace />;
  return <>{children}</>;
};

const PublicOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { isInvestor, isSuperadmin, loading: roleLoading } = useUserRole();

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (user) {
    const dest = isSuperadmin ? "/superadmin" : isInvestor ? "/reports" : "/order/create";
    return <Navigate to={dest} replace />;
  }

  return <>{children}</>;
};

const App = () => {
  useTimeBasedTheme();
  useAutoEndDay();
  return (
  <QueryClientProvider client={queryClient}>
    <RestaurantRoleProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <NotificationSound />
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>}>
            <Routes>
              <Route path="/" element={<PublicOnlyRoute><Landing /></PublicOnlyRoute>} />
              <Route path="/auth" element={<PublicOnlyRoute><Auth /></PublicOnlyRoute>} />
              <Route path="/order/:restaurantId" element={<PublicOrder />} />
              <Route path="/dashboard" element={<ObserverBlockedRoute><Dashboard /></ObserverBlockedRoute>} />
              <Route path="/menu" element={<ObserverBlockedRoute><MenuManagement /></ObserverBlockedRoute>} />
              <Route path="/order/create" element={<ObserverBlockedRoute><CreateOrder /></ObserverBlockedRoute>} />
              <Route path="/orders" element={<ObserverBlockedRoute><OrderHistory /></ObserverBlockedRoute>} />
              <Route path="/receipt/:id" element={<Receipt />} />
              <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
              <Route path="/inventory" element={<ObserverBlockedRoute><Inventory /></ObserverBlockedRoute>} />
              <Route path="/tabs" element={<ObserverBlockedRoute><TabsPage /></ObserverBlockedRoute>} />
              <Route path="/debtors" element={<ObserverBlockedRoute><Debtors /></ObserverBlockedRoute>} />
              <Route path="/report/:id" element={<ProtectedRoute><ReportBreakdown /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
              <Route path="/superadmin" element={<SuperadminRoute><SuperDashboard /></SuperadminRoute>} />
              <Route path="/superadmin/restaurants" element={<SuperadminRoute><SuperRestaurants /></SuperadminRoute>} />
              <Route path="/superadmin/restaurants/:id" element={<SuperadminRoute><SuperRestaurantDetail /></SuperadminRoute>} />
              <Route path="/superadmin/orders" element={<SuperadminRoute><SuperOrders /></SuperadminRoute>} />
              <Route path="/superadmin/analytics" element={<SuperadminRoute><SuperAnalytics /></SuperadminRoute>} />
              <Route path="/superadmin/products" element={<SuperadminRoute><SuperProducts /></SuperadminRoute>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </RestaurantRoleProvider>
  </QueryClientProvider>
  );
};

export default App;
