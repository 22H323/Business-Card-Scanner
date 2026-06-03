import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ValueRole = "primary" | "secondary" | "none";

export type PickerItem = {
  value: string;
  included: boolean;
  role: ValueRole;
};

type ExtractedValuePickerProps = {
  label: string;
  items: PickerItem[];
  onChange: (items: PickerItem[]) => void;
};

export function createPickerItems(values: string[]): PickerItem[] {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length === 0) return [];
  return unique.map((value, index) => ({
    value,
    included: true,
    role: index === 0 ? "primary" : "none",
  }));
}

export function resolvePickerValues(items: PickerItem[]): {
  primary: string;
  secondary: string;
  allIncluded: string[];
} {
  const included = items.filter((i) => i.included);
  const primary = included.find((i) => i.role === "primary")?.value || included[0]?.value || "";
  const secondary = included.find((i) => i.role === "secondary")?.value || "";
  return { primary, secondary, allIncluded: included.map((i) => i.value) };
}

function setPrimary(items: PickerItem[], index: number): PickerItem[] {
  return items.map((item, i) => {
    if (i === index) return { ...item, included: true, role: "primary" as const };
    if (item.role === "primary") return { ...item, role: "none" as const };
    return item;
  });
}

function setSecondary(items: PickerItem[], index: number): PickerItem[] {
  return items.map((item, i) => {
    if (i === index) return { ...item, included: true, role: "secondary" as const };
    if (item.role === "secondary") return { ...item, role: "none" as const };
    return item;
  });
}

function discardItem(items: PickerItem[], index: number): PickerItem[] {
  const next = items.map((item, i) => {
    if (i !== index) return item;
    return { ...item, included: false, role: "none" };
  });

  const included = next.filter((i) => i.included);
  if (included.length === 0) return next;

  const hasPrimary = included.some((i) => i.role === "primary");
  if (!hasPrimary) {
    const firstIdx = next.findIndex((i) => i.included);
    if (firstIdx >= 0) next[firstIdx] = { ...next[firstIdx], role: "primary" };
  }
  return next;
}

function toggleIncluded(items: PickerItem[], index: number): PickerItem[] {
  const next = items.map((item, i) => {
    if (i !== index) return item;
    const included = !item.included;
    return { ...item, included, role: included ? item.role : "none" };
  });

  const included = next.filter((i) => i.included);
  if (included.length === 0) return next;

  const hasPrimary = included.some((i) => i.role === "primary");
  if (!hasPrimary) {
    const firstIdx = next.findIndex((i) => i.included);
    if (firstIdx >= 0) next[firstIdx] = { ...next[firstIdx], role: "primary" };
  }
  return next;
}

export function ExtractedValuePicker({ label, items, onChange }: ExtractedValuePickerProps) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">{label}</Label>
        <span className="text-[11px] text-muted-foreground">{items.length} detected</span>
      </div>

      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={`${item.value}-${index}`}
            className={cn(
              "rounded-xl border px-3 py-2.5 transition-colors",
              !item.included ? "border-border/40 bg-muted/10 opacity-50" : "border-border/60 bg-muted/20",
            )}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex cursor-pointer items-center gap-2.5">
                <Checkbox
                  checked={item.included}
                  onCheckedChange={() => onChange(toggleIncluded(items, index))}
                />
                <span className={cn("text-sm font-medium", !item.included && "line-through text-muted-foreground")}>
                  {item.value}
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-1.5 pl-6 sm:pl-0">
                <button
                  type="button"
                  onClick={() => onChange(setPrimary(items, index))}
                  className={cn(
                    "rounded-lg px-2 py-1 text-[11px] font-medium",
                    item.role === "primary"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background/60 text-muted-foreground hover:bg-background",
                  )}
                >
                  Primary
                </button>
                <button
                  type="button"
                  onClick={() => onChange(setSecondary(items, index))}
                  className={cn(
                    "rounded-lg px-2 py-1 text-[11px] font-medium",
                    item.role === "secondary"
                      ? "bg-violet-500 text-white"
                      : "bg-background/60 text-muted-foreground hover:bg-background",
                  )}
                >
                  Secondary
                </button>
                <button
                  type="button"
                  onClick={() => onChange(discardItem(items, index))}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-destructive/50 bg-destructive/5 text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!item.included}
                  aria-label="Discard value"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
