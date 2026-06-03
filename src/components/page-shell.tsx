import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function PageShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto w-full max-w-7xl space-y-6 px-3 py-4 sm:space-y-8 sm:px-4 sm:py-6 md:px-8 md:py-10"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl">{title}</h1>
          {description && (
            <p className="max-w-xl text-xs text-muted-foreground sm:text-sm">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex w-full gap-2 overflow-x-auto hide-scrollbar pb-0.5 sm:w-auto sm:flex-wrap sm:justify-end">
            {actions}
          </div>
        )}
      </div>
      {children}
    </motion.div>
  );
}
