import type { ReactNode } from "react";

/** The one-line empty state: a muted sentence and, when there is an obvious next step, one button. */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 py-6">
      <p className="text-muted-foreground text-sm">{children}</p>
      {action}
    </div>
  );
}

/** Shown when a query fails. */
export function LoadError({ message }: { message: string }) {
  return <p className="text-destructive py-6 text-sm">{message}</p>;
}

/** A section heading with an optional count and actions on the right. */
export function SectionHeading({ title, detail, children }: { title: string; detail?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
      <h2 className="t-label text-[12.5px]">{title}</h2>
      {detail ? <span className="text-muted-foreground text-xs tabular-nums">{detail}</span> : null}
      {children ? <div className="ml-auto flex items-center gap-2">{children}</div> : null}
    </div>
  );
}
