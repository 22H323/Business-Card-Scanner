import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ReactNode } from "react";

export const Modal = ({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode }) => (
  <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle>{title}</DialogTitle>{description ? <DialogDescription>{description}</DialogDescription> : null}</DialogHeader>{children}</DialogContent></Dialog>
);
