"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "~/lib/utils";

/**
 * A single-value slider. `tone="brand"` fills in brand red (playback
 * progress); the default fills in the foreground colour (volume). The thumb
 * appears on hover and focus, so a resting slider reads as a plain bar.
 */
function Slider({
  className,
  tone = "default",
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & { tone?: "default" | "brand" }) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "group/slider relative flex h-4 w-full touch-none items-center select-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="bg-secondary relative h-1 w-full grow overflow-hidden rounded-full">
        <SliderPrimitive.Range className={cn("absolute h-full", tone === "brand" ? "bg-brand" : "bg-foreground")} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="bg-foreground focus-visible:ring-ring/50 block size-3 rounded-full opacity-0 outline-none group-hover/slider:opacity-100 focus-visible:opacity-100 focus-visible:ring-[3px] pointer-coarse:opacity-100" />
    </SliderPrimitive.Root>
  );
}

export { Slider };
