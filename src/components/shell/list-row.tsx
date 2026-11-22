import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

/** A list of hairline rows, for inside a card. */
export function ListRows({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("flex flex-col", className)}>{children}</ul>;
}

/** One row: an icon tile, a title and its detail, and actions on the right. */
export function ListRow({
  icon,
  title,
  detail,
  children,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <li className={cn("flex items-center gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0", className)}>
      {icon ? (
        <span className="bg-secondary grid size-9 shrink-0 place-items-center rounded-lg [&>svg]:size-4">{icon}</span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {detail ? <p className="text-muted-foreground text-xs">{detail}</p> : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-1.5">{children}</div> : null}
    </li>
  );
}
