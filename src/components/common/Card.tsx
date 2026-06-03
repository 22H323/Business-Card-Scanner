import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={cn("rounded-2xl border border-border/60 bg-card p-5 shadow-soft", className)}>{children}</div>
);
