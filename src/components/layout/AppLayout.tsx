import type { ReactNode } from "react";

export const AppLayout = ({ left, right }: { left: ReactNode; right: ReactNode }) => (
  <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
    <div className="flex flex-col gap-6">{left}</div>
    <div className="flex flex-col gap-6">{right}</div>
  </div>
);
