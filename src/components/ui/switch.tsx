"use client";

import * as React from "react";
import { cn } from "~/lib/utils";

interface SwitchProps extends Omit<React.ComponentProps<"button">, "role"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    { className, checked = false, onCheckedChange, disabled, ...props },
    ref,
  ) => {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        data-state={checked ? "checked" : "unchecked"}
        disabled={disabled}
        ref={ref}
        className={cn(
          "peer focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-[5px] border-2 border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          // On is an ink track with the lamp lit.
          checked ? "bg-ink" : "bg-input",
          className,
        )}
        onClick={() => {
          if (!disabled && onCheckedChange) {
            onCheckedChange(!checked);
          }
        }}
        {...props}
      >
        <span
          className={cn(
            "pointer-events-none block h-5 w-5 rounded-[3px] ring-0 transition-[translate,background-color]",
            checked ? "bg-lamp translate-x-4" : "bg-background translate-x-0",
          )}
        />
      </button>
    );
  },
);
Switch.displayName = "Switch";

export { Switch };
