import type { ReactNode } from "react";

import { heroCard, heroCover } from "~/components/library/hero";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

// Placeholders in the shape of what is on its way. Each is print, like the
// thing it stands for, so a page doesn't change ground when its data lands.

const card = "print rounded-lg shadow-[0_1px_2px_rgb(0_0_0/0.14)]";

/** A form section still loading: its heading, then a few lines. `sections` stacks several. */
export function CardSkeleton({ lines = 4, sections = 1, className }: { lines?: number; sections?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-6", className)} aria-hidden>
      {Array.from({ length: sections }, (_, section) => (
        <div key={section} className={cn(card, "flex flex-col gap-4 p-5")}>
          <Skeleton className="h-3 w-28" />
          {Array.from({ length: lines }, (_, i) => (
            <Skeleton key={i} className={cn("h-8", i === lines - 1 ? "w-1/3" : "w-full")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The top of an album or playlist page while it loads: the cover, the name, the band, the keys. `cover` is the real one, when the page can already show it. */
export function HeroSkeleton({ cover }: { cover?: ReactNode }) {
  return (
    <div className={heroCard} aria-hidden>
      <div className={heroCover}>{cover ?? <Skeleton className="aspect-square rounded-[3px]" />}</div>
      <div className="sm:self-end">
        <Skeleton className="h-7 w-2/3 max-w-80 sm:h-9" />
        <Skeleton className="mt-2 h-6 w-full sm:mt-3 sm:h-7" />
      </div>
      <div className="flex gap-2 self-end sm:col-start-2">
        <Skeleton className="h-[34px] w-11 sm:w-24" />
        <Skeleton className="h-[34px] w-11 sm:w-36" />
      </div>
    </div>
  );
}

/** A list of rows under a band, for track lists and the playlist tree while they load. */
export function RowsSkeleton({ rows = 8, covers = false, className }: { rows?: number; covers?: boolean; className?: string }) {
  return (
    <div className={cn(card, "overflow-hidden", className)} aria-hidden>
      <div className="bg-brand h-8" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-11 items-center gap-3 border-b px-4 last:border-b-0">
          <Skeleton className="h-4 w-8" />
          {covers ? <Skeleton className="size-8 rounded-[3px]" /> : null}
          {/* Widths vary a little so it reads as a list, not a grid. */}
          <Skeleton className="h-4" style={{ width: `${28 + ((i * 17) % 30)}%` }} />
          <Skeleton className="ml-auto h-4 w-10" />
        </div>
      ))}
    </div>
  );
}
