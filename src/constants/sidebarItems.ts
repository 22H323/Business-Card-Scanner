import { BarChart3, Inbox, LayoutDashboard, ScanLine, Settings, Users } from "lucide-react";

export const sidebarItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Scan", url: "/scan", icon: ScanLine },
  { title: "Contacts", url: "/contacts", icon: Users },
  { title: "Queue Center", url: "/queue", icon: Inbox },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];
