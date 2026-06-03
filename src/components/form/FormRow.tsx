import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
export const FormRow = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn("space-y-1.5", className)}>{children}</div>;
