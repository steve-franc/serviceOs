import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { NotificationSound } from "./components/NotificationSound";
import ScrollToTop from "./components/ScrollToTop";

// Lazy-load all pages for faster initial load
const Auth = lazy(() => import("./pages/Auth"));
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <NotificationSound />
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>}>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/order" element={<PublicOrder />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/menu" element={<ProtectedRoute><MenuManagement /></ProtectedRoute>} />
            <Route path="/order/create" element={<ProtectedRoute><CreateOrder /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute><OrderHistory /></ProtectedRoute>} />
            <Route path="/receipt/:id" element={<ProtectedRoute><Receipt /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
            <Route path="/tabs" element={<ProtectedRoute><TabsPage /></ProtectedRoute>} />
            <Route path="/report/:id" element={<ProtectedRoute><ReportBreakdown /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
