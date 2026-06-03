export const Navbar = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="mb-6 flex flex-col gap-1"><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1><p className="text-sm text-muted-foreground">{subtitle}</p></div>
);
