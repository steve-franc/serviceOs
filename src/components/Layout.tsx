import { ReactNode } from "react";
import AppShell from "./AppShell";
import { useBrandTheme } from "@/hooks/useBrandTheme";
import { useRestaurantContext } from "@/hooks/useRestaurantAndRole";

interface LayoutProps { children?: ReactNode }

const Layout = ({ children }: LayoutProps) => {
  const { restaurantId } = useRestaurantContext();
  useBrandTheme(restaurantId);
  return <AppShell>{children}</AppShell>;
};

export default Layout;
