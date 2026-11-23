"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "~/lib/utils";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    // The wrapper owns the horizontal scroll so tab bars that are wider than a
    // phone screen scroll instead of squashing their triggers. It also carries
    // the vertical padding, so focus rings aren't clipped by the scroll box.
    <div className="no-scrollbar -my-1 max-w-full overflow-x-auto overscroll-x-contain py-1">
      <TabsPrimitive.List
        data-slot="tabs-list"
        className={cn(
          "border-strip inline-flex w-fit items-end gap-1 border-b-[3px]",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // `min-w-fit` keeps a trigger at its content width: rather than
        // shrinking to fit a narrow screen, the list grows and the wrapper
        // scrolls. `flex-1` still spreads triggers when there is room to spare.
        "t-label bg-secondary text-foreground/80 hover:text-foreground data-[state=active]:bg-strip data-[state=active]:text-ink focus-visible:ring-ring/60 inline-flex min-w-fit flex-1 items-center justify-center gap-1.5 rounded-t-md px-3.5 pt-2 pb-[7px] text-[12.5px] whitespace-nowrap transition-colors select-none outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 data-[state=active]:pb-[9px] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
