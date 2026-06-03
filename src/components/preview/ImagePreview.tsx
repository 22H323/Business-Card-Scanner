import { Button } from "@/components/common/Button";

export const ImagePreview = ({
  src,
  fileName,
  onClear,
}: {
  src: string;
  fileName: string;
  onClear: () => void;
}) => (
  <div className="space-y-4">
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <img src={src} alt="Business card preview" className="h-56 w-full object-cover" />
    </div>
    <div className="flex items-center justify-between">
      <p className="truncate text-xs text-muted-foreground">{fileName}</p>
      <Button variantType="danger" onClick={onClear}>
        Remove
      </Button>
    </div>
  </div>
);
