import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/* Design system: all buttons use 12px radius, 48px default height, 8pt horizontal padding */
const buttonVariants = cva(
  "btn-blink inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:     "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.98]",
        outline:     "border border-input bg-background hover:bg-gray-50 hover:text-foreground active:scale-[0.98]",
        secondary:   "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-[0.98]",
        ghost:       "hover:bg-gray-100 hover:text-foreground",
        link:        "text-primary underline-offset-4 hover:underline p-0 h-auto",
        accent:      "bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.98] shadow-sm hover:shadow-md",
        hero:        "bg-white text-primary hover:bg-white/90 active:scale-[0.98] shadow-lg hover:shadow-xl text-base px-6 font-semibold",
        "hero-outline": "border-2 border-white/80 bg-transparent text-white hover:bg-white/10 active:scale-[0.98] text-base px-6 font-semibold",
        success:     "bg-success text-success-foreground hover:bg-success/90 active:scale-[0.98]",
      },
      size: {
        default: "h-12 px-6 py-0",          /* 48px — design system standard */
        sm:      "h-9 px-4 text-[13px]",    /* 36px — compact contexts */
        lg:      "h-12 px-8 text-base",     /* 48px explicit lg alias */
        xl:      "h-[52px] px-10 text-base",
        icon:    "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
