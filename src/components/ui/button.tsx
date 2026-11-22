import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const buttonVariants = cva(
  // Keys: capitals, and (on the filled ones) a lower edge that shortens as the key goes down.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[12.5px] font-semibold tracking-[0.06em] uppercase transition-[background-color,color,filter,box-shadow,transform] duration-100 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/60 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // Ivory on the cabinet, ink on print.
        default: "key bg-primary text-primary-foreground hover:brightness-110",
        // Coral: the one main action on a screen.
        brand: "key bg-brand text-ink hover:brightness-105",
        destructive: "border border-destructive text-destructive hover:bg-destructive/10",
        outline: "border border-input hover:bg-accent hover:text-accent-foreground",
        secondary: "key bg-secondary text-secondary-foreground hover:brightness-105",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-foreground tracking-normal normal-case underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[34px] px-3.5 has-[>svg]:px-3",
        xs: "h-6 gap-1 px-2 text-[11px] has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 px-2.5 text-[11.5px] has-[>svg]:px-2",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-[34px]",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
