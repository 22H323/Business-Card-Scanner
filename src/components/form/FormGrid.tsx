import type { ReactNode } from "react";
export const FormGrid = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>;
