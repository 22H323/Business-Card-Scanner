import { CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";

const HIDDEN_PREVIEW_FIELDS = new Set(["notes", "firstName", "lastName", "secondaryAddress"]);

export const OCRPreview = ({ values }: { values: Record<string, string> }) => {
  const entries = Object.entries(values).filter(
    ([key, value]) => Boolean(value) && !HIDDEN_PREVIEW_FIELDS.has(key),
  );

  if (entries.length === 0)
    return (
      <EmptyState
        title="No OCR data yet"
        description="Upload an image to preview extracted text fields."
      />
    );

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2"
        >
          <span className="text-xs font-medium text-muted-foreground">{key}</span>
          <span className="max-w-[70%] truncate text-xs">{value}</span>
        </div>
      ))}
      <div className="mt-3 inline-flex items-center gap-2 text-xs text-success">
        <CheckCircle2 className="h-3.5 w-3.5" /> OCR extraction ready
      </div>
    </div>
  );
};
