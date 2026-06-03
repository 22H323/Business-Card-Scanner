import type { LeadField } from "@/constants/formFields";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CONFIDENCE_LOW_THRESHOLD } from "@/lib/scanResult";
import { TextInput } from "./inputs/TextInput";
import { EmailInput } from "./inputs/EmailInput";
import { PhoneInput } from "./inputs/PhoneInput";
import { UrlInput } from "./inputs/UrlInput";
import { TextAreaInput } from "./inputs/TextAreaInput";
import { ValidationMessage } from "./ValidationMessage";

const componentMap = { TextInput, EmailInput, PhoneInput, UrlInput, TextAreaInput };

export const FieldRenderer = ({
  field,
  value,
  error,
  confidence,
  onChange,
}: {
  field: LeadField;
  value: string;
  error?: string;
  confidence?: number;
  onChange: (name: string, value: string) => void;
}) => {
  const Component = componentMap[field.component];
  const isLow = confidence !== undefined && confidence > 0 && confidence < CONFIDENCE_LOW_THRESHOLD;
  const showConfidence = confidence !== undefined && confidence > 0;

  return (
    <div
      className={cn(
        "space-y-1.5 rounded-xl p-2 transition-colors",
        isLow && "border border-amber-500/40 bg-amber-500/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">{field.label}</Label>
        {showConfidence && (
          <span
            className={cn(
              "text-[10px] font-semibold tabular-nums",
              isLow ? "text-amber-600 dark:text-amber-400" : "text-success",
            )}
          >
            {Math.round(confidence)}% {isLow ? "· verify" : ""}
          </span>
        )}
      </div>
      <Component
        value={value}
        placeholder={field.placeholder}
        onChange={(next) => onChange(field.name, next)}
      />
      <ValidationMessage message={error} />
    </div>
  );
};
