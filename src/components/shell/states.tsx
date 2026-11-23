"use client";

import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";

import { Button } from "~/components/ui/button";
import { isFinal, type Failure } from "~/trpc/failure";

/** The one-line empty state: a muted sentence and, when there is an obvious next step, one button. */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 py-6">
      <p className="text-muted-foreground text-sm">{children}</p>
      {action}
    </div>
  );
}

/**
 * Shown when a query fails: what went wrong, on print so it reads on the
 * cabinet at any hour, and a key that asks again for everything on the page
 * that failed. An answer that asking again won't change (not found, not
 * allowed) gets no key.
 */
export function LoadError({ error }: { error: Failure }) {
  const queryClient = useQueryClient();
  const final = isFinal(error);
  return (
    <div role="alert" className="print flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="t-label text-[12.5px]">{final ? "Nothing here" : "That didn't load"}</p>
        <p className="text-muted-foreground text-sm">{error.message}</p>
      </div>
      {final ? null : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void queryClient.refetchQueries({ type: "active", predicate: (query) => query.state.status === "error" })}
        >
          <RotateCw />
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * A section heading with an optional count and actions on the right. A row
 * of tiles on a page with several has its `letter` on an amber plate before
 * the title: the first half of its tiles' codes.
 */
export function SectionHeading({ title, letter, detail, children }: { title: string; letter?: string; detail?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
      <h2 className="t-label flex items-center gap-2.5 text-[12.5px]">
        {letter ? (
          <span className="plate text-lamp min-w-[1.375rem] [text-shadow:0_0_8px_rgb(255_196_77/0.5)]" aria-hidden>
            {letter}
          </span>
        ) : null}
        {title}
      </h2>
      {detail ? <span className="text-muted-foreground text-xs tabular-nums">{detail}</span> : null}
      {children ? <div className="ml-auto flex items-center gap-2">{children}</div> : null}
    </div>
  );
}
