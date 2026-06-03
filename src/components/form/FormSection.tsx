import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const FormSection = ({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) => (
  <section className={cn("space-y-4", className)}>
    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
    {children}
  </section>
);
