import { sidebarItems } from "@/constants/sidebarItems";

export const Sidebar = () => (
  <aside className="rounded-2xl border border-border/60 bg-card p-4 shadow-soft"><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modules</p><ul className="space-y-2">{sidebarItems.map((item) => <li key={item.title} className="rounded-lg px-2 py-1 text-sm text-muted-foreground">{item.title}</li>)}</ul></aside>
);
