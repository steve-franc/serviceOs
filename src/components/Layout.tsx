import { ReactNode } from "react";
import AppShell from "./AppShell";

interface LayoutProps { children?: ReactNode }

const Layout = ({ children }: LayoutProps) => <AppShell>{children}</AppShell>;

export default Layout;
