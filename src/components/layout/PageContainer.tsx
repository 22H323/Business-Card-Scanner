import type { ReactNode } from "react";

export const PageContainer = ({ children }: { children: ReactNode }) => (
  <section className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</section>
);
