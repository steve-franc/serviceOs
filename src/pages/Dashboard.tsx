import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";

const Dashboard = () => {
  const navigate = useNavigate();
  const { role, loading } = useUserRole();

  useEffect(() => {
    if (loading) return;

    // Redirect based on user role
    if (role === "restaurant") {
      navigate("/menu", { replace: true });
    } else if (role === "admin") {
      navigate("/admin", { replace: true });
    } else {
      // Regular users go to home feed
      navigate("/home", { replace: true });
    }
  }, [role, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  );
};

export default Dashboard;
