import { cn } from "~/lib/utils";

/**
 * Content column for a page. The header carries the page title, so a
 * page starts straight on its content. Each page rises into place once
 * when it is navigated to.
 */
export function Page({
  maxWidth = "max-w-7xl",
  className,
  children,
}: {
  maxWidth?: "max-w-2xl" | "max-w-4xl" | "max-w-5xl" | "max-w-7xl";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("animate-rise mx-auto w-full min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-6", maxWidth, className)}>
      {children}
    </div>
  );
}
