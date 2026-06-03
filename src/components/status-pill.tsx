import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import type { ContactStatus } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const map = {
  synced: {
    label: "Synced",
    icon: CheckCircle2,
    cls: "bg-success/10 text-success border-success/20",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    cls: "bg-warning/15 text-warning-foreground border-warning/30",
  },
  failed: {
    label: "Failed",
    icon: AlertTriangle,
    cls: "bg-destructive/10 text-destructive border-destructive/20",
  },
};

export function StatusPill({ status, className }: { status: ContactStatus; className?: string }) {
  const m = map[status];
  const Icon = m.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        m.cls,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}
