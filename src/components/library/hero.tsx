import type { ReactNode } from "react";

/**
 * The top of an album or playlist page, as a printed card: the cover, the
 * name lettered large, the facts on the coral band, and the keys under them.
 */
export function Hero({ cover, title, band, note, children }: { cover: ReactNode; title: string; band: ReactNode; note?: ReactNode; children?: ReactNode }) {
  return (
    <div className="print mb-4 flex flex-col gap-5 rounded-lg p-5 shadow-[0_1px_2px_rgb(0_0_0/0.14)] sm:flex-row sm:items-end">
      {cover}
      <div className="min-w-0 flex-1">
        <h1 className="font-title text-3xl text-balance sm:text-[38px]">{title}</h1>
        <p className="bg-brand mt-2 flex flex-wrap gap-x-4 rounded-[3px] px-2.5 py-1 text-sm font-medium tabular-nums">{band}</p>
        {note ? <p className="text-muted-foreground mt-2 max-w-prose text-sm">{note}</p> : null}
        {children ? <div className="mt-4 flex flex-wrap items-center gap-2">{children}</div> : null}
      </div>
    </div>
  );
}
