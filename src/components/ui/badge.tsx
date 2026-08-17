import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Handoff: 20px de altura, raio 5px, 10.5px em peso 700, caixa alta com
// tracking. O badge é um rótulo de estado, não um botão — por isso é pequeno,
// retangular e sem hover.
const badgeVariants = cva(
  "inline-flex h-5 items-center rounded-[5px] border px-2 text-[10.5px] font-bold uppercase leading-none tracking-[0.06em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-input text-foreground",
        // Tons suaves para estado em listagens, onde o badge sólido pesaria
        success: "border-transparent bg-success/12 text-success",
        warning: "border-transparent bg-warning/15 text-warning",
        info: "border-transparent bg-info/12 text-info",
        soft: "border-transparent bg-primary/12 text-primary",
        neutral: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
