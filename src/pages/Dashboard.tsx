import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to create order page as default
    navigate("/order/create", { replace: true });
  }, [navigate]);

  return null;
};

export default Dashboard;
