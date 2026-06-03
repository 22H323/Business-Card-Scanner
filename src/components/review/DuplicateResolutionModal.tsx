import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import type { DuplicateMatch } from "@/lib/duplicateDetection";
import { diffContacts } from "@/lib/duplicateDetection";
import type { LeadPayload } from "@/lib/cardImage";

export type DuplicateAction = "update" | "merge" | "new" | "discard";

type DuplicateResolutionModalProps = {
  open: boolean;
  match: DuplicateMatch | null;
  incoming: LeadPayload;
  onResolve: (action: DuplicateAction) => void;
};

export function DuplicateResolutionModal({
  open,
  match,
  incoming,
  onResolve,
}: DuplicateResolutionModalProps) {
  if (!match) return null;

  const existing = match.contact;
  const diffs = diffContacts(existing, incoming);
  const name = existing.fullName || existing.name || "Existing contact";

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onResolve("discard")}
      title="Possible duplicate found"
      description={`A contact matching this card already exists (${match.matchedBy.join(", ")}).`}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
          <div className="font-medium">{name}</div>
          <div className="text-xs text-muted-foreground">{existing.company}</div>
        </div>

        {diffs.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Differences</p>
            {diffs.map((d) => (
              <div key={d.field} className="rounded-lg border border-border/40 p-2 text-xs">
                <div className="font-medium">{d.field}</div>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground">Existing: </span>
                    {d.existing}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Scanned: </span>
                    {d.incoming}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Scanned data matches the existing record closely.</p>
        )}

        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variantType="secondary" onClick={() => onResolve("update")}>
            Update existing
          </Button>
          <Button variantType="secondary" onClick={() => onResolve("merge")}>
            Merge contact
          </Button>
          <Button onClick={() => onResolve("new")}>Save as new</Button>
          <Button variantType="secondary" onClick={() => onResolve("discard")}>
            Discard
          </Button>
        </div>
      </div>
    </Modal>
  );
}
