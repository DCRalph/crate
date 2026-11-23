import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import { PageScroller } from "./content-scroller";
import { PageTitle } from "./page-title";
import { PageTransition } from "./transitions";

/**
 * A page behind the glass, in its own scroller. It opens with the page's
 * title, lettered large, with `detail` (a count, say) beside it and
 * `actions` on the right. Pages that open with their own headline (an album,
 * a playlist) pass `title="trail"` to get just the way back in small
 * capitals, and `title="none"` leaves it out. Going from one page to
 * another, the old one fades out as the new one rises into place (see
 * `PageTransition`).
 */
export function Page({
  maxWidth = "max-w-7xl",
  title = "heading",
  detail,
  actions,
  className,
  children,
}: {
  maxWidth?: "max-w-2xl" | "max-w-4xl" | "max-w-5xl" | "max-w-6xl" | "max-w-7xl";
  title?: "heading" | "trail" | "none";
  detail?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <PageTransition>
      <PageScroller>
        <div className={cn("page-enter mx-auto w-full min-w-0 px-4 pt-4 pb-8 sm:px-6 sm:pt-5 lg:px-8 lg:pt-6 lg:pb-10", maxWidth)}>
          {title === "none" ? null : <PageTitle variant={title} detail={detail} actions={actions} />}
          <div className={className}>{children}</div>
        </div>
      </PageScroller>
    </PageTransition>
  );
}
