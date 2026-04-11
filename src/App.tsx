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

const PublicOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/order/create" replace />;
  }

  return <>{children}</>;
};

const App = () => {
  useTimeBasedTheme();
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
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/menu" element={<ProtectedRoute><MenuManagement /></ProtectedRoute>} />
              <Route path="/order/create" element={<ProtectedRoute><CreateOrder /></ProtectedRoute>} />
              <Route path="/orders" element={<ProtectedRoute><OrderHistory /></ProtectedRoute>} />
              <Route path="/receipt/:id" element={<Receipt />} />
              <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
              <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
              <Route path="/tabs" element={<ProtectedRoute><TabsPage /></ProtectedRoute>} />
              <Route path="/debtors" element={<ProtectedRoute><Debtors /></ProtectedRoute>} />
              <Route path="/report/:id" element={<ProtectedRoute><ReportBreakdown /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
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
