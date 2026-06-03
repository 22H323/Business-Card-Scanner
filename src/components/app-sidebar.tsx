import { Link, useRouterState } from "@tanstack/react-router";
import {
  Sparkles,
  ChevronsUpDown,
} from "lucide-react";
import { sidebarItems } from "@/constants/sidebarItems";
import { useUserSettings } from "@/hooks/useUserSettings";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items = sidebarItems.filter((item) =>
  ["/scan", "/contacts", "/queue", "/settings"].includes(item.url),
);

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { fullName, email, initials } = useUserSettings();
  const isActive = (url: string) => {
    if (url === "/scan") {
      return path === "/scan" || path === "/" || path.startsWith("/review");
    }
    return path.startsWith(url);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">
      <SidebarHeader className="px-3 pt-4">
        <Link to="/" className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-display text-[15px] font-semibold tracking-tight">CardSync AI</div>
              <div className="text-[11px] text-muted-foreground">Lead capture · v2.4</div>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className="h-10 rounded-[0.5rem] data-[active=true]:rounded-[0.5rem] data-[active=true]:bg-accent data-[active=true]:text-accent-foreground data-[active=true]:font-medium"
                    >
                      <Link to={item.url} className="flex items-center gap-3">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span className="text-md">{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/*       <SidebarFooter className="p-3">
        <Link
          to="/settings"
          className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 p-2.5 shadow-soft transition hover:bg-muted/40"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-primary text-sm font-semibold text-primary-foreground">
            {initials}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-medium">{fullName}</div>
                <div className="truncate text-[11px] text-muted-foreground">{email}</div>
              </div>
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
            </>
          )}
        </Link>
      </SidebarFooter> */}
    </Sidebar>
  );
}
