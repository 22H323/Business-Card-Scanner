import type { ReactNode } from "react";

export const EmptyState = ({ icon, title, description }: { icon?: ReactNode; title: string; description: string }) => (
  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center">{icon && <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</div>}<h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>
);
