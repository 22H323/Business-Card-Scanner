import { Button } from "@/components/common/Button";

export const FormActions = ({
  onReset,
  onSave,
  saving,
}: {
  onReset: () => void;
  onSave: () => void;
  saving: boolean;
}) => (
  <div className="sticky bottom-0 z-20 mt-6 flex gap-3 bg-background/90 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:static sm:bg-transparent sm:p-0">
    <Button variantType="secondary" className="flex-1 sm:flex-none" onClick={onReset}>
      Discard
    </Button>
    <Button variantType="primary" className="flex-1 sm:flex-none" onClick={onSave} disabled={saving}>
      {saving ? "Saving..." : "Save Lead"}
    </Button>
  </div>
);
