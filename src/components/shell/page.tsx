import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import { PageTitle } from "./page-title";

/**
 * Content column for a page. It opens with the page's title, lettered large,
 * with `detail` (a count, say) beside it and `actions` on the right. Pages
 * that open with their own headline (an album, a playlist) pass
 * `title="trail"` to get just the way back in small capitals, and
 * `title="none"` leaves it out. Each page rises into place once when it is
 * navigated to.
 */
export function Page({
  maxWidth = "max-w-7xl",
  title = "heading",
  detail,
  actions,
  className,
  children,
}: {
  maxWidth?: "max-w-2xl" | "max-w-4xl" | "max-w-5xl" | "max-w-7xl";
  title?: "heading" | "trail" | "none";
  detail?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("animate-rise mx-auto w-full min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-6", maxWidth)}>
      {title === "none" ? null : <PageTitle variant={title} detail={detail} actions={actions} />}
      <div className={className}>{children}</div>
    </div>
  );
}
