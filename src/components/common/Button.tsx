import { Button as UIButton } from "@/components/ui/button";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Props = ComponentProps<typeof UIButton> & { variantType?: "primary" | "secondary" | "outline" | "danger" };

const classes = {
  primary: "bg-gradient-primary text-primary-foreground shadow-glow",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border border-border/60 bg-transparent hover:bg-muted/60",
  danger: "bg-destructive text-destructive-foreground",
} as const;

export const Button = ({ className, variantType = "primary", ...props }: Props) => (
  <UIButton className={cn("rounded-xl", classes[variantType], className)} {...props} />
);
