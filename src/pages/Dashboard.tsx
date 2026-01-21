import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";

const Dashboard = () => {
  const navigate = useNavigate();
  const { role, loading, isManager } = useUserRole();

  useEffect(() => {
    if (loading) return;

    // Redirect based on user role
    if (isManager) {
      navigate("/admin", { replace: true });
    } else {
      // All other roles (server, ops, counter) go to create order
      navigate("/order/create", { replace: true });
    }
  }, [role, loading, isManager, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  );
};

export default Dashboard;
