import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageSkeleton } from "@/components/PageSkeleton";

const Dashboard = () => {
  const navigate = useNavigate();
  const { role, loading, isManager, isSuperadmin } = useUserRole();

  useEffect(() => {
    if (loading) return;
    if (isSuperadmin) { navigate("/superadmin", { replace: true }); return; }
    // No role assigned yet → show empty state (no redirect)
    if (!role) return;

    if (isManager) navigate("/admin", { replace: true });
    else navigate("/order/create", { replace: true });
  }, [role, loading, isManager, isSuperadmin, navigate]);

  if (loading) {
    return <PageSkeleton />;
  }

  if (!role) {
    return (
      <>
        <div className="max-w-xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Role not assigned</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Meet administrator to be assigned to a role.
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return null;
};

export default Dashboard;
