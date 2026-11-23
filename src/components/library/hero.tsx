import type { ReactNode } from "react";

import { Skeleton } from "~/components/ui/skeleton";
import type { WebTrack } from "~/server/api/routers/library";
import { PlayKey } from "./play-key";

/** One line of what is known about a record, in the column under its cover. */
export type Fact = { label: string; value: ReactNode };

/**
 * An album or playlist page, laid out like a record behind the glass: its
 * cover in a column of its own, lit in its own colour, with what is known
 * about it under the cover; and beside it the name lettered large, the facts
 * that matter most on the coral band, the keys, and then `children` (its
 * tracks). On a wide screen the cover column stays put while the tracks
 * scroll. On a phone the cover is small and beside the name, with the Play
 * key on its corner, and the facts under it are left out.
 * `from` and `tracks` are what its Play key plays.
 */
export function RecordLayout({
  cover,
  title,
  band,
  note,
  facts = [],
  from,
  tracks,
  keys,
  children,
}: {
  cover: ReactNode;
  title: string;
  band: ReactNode;
  note?: ReactNode;
  facts?: Fact[];
  from: string;
  tracks: WebTrack[];
  keys?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={recordGrid}>
      <aside className={recordAside}>
        <div className="relative">
          {cover}
          <PlayKey from={from} tracks={tracks} compact className="absolute right-1.5 bottom-1.5 sm:hidden" />
        </div>
        {facts.length ? (
          <dl className="animate-arrive mt-5 grid grid-cols-[5.5rem_minmax(0,1fr)] text-[13px] max-lg:hidden">
            {facts.map((fact) => (
              <div key={fact.label} className="contents">
                <dt className="t-label text-muted-foreground border-t py-2 text-[10.5px] leading-[1.35]">{fact.label}</dt>
                <dd className="min-w-0 border-t py-1.5 break-words">{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </aside>
      <header className="min-w-0 self-end lg:self-start">
        <h1 className="font-title animate-arrive text-[28px] leading-[0.95] text-balance break-words sm:text-[44px] lg:text-[56px] lg:leading-[0.9]">{title}</h1>
        <p className="bg-brand text-ink mt-2.5 flex flex-wrap gap-x-3.5 gap-y-0.5 rounded-[3px] px-2.5 py-0.5 text-[12.5px] font-medium tabular-nums shadow-[inset_0_1px_0_rgb(255_255_255/0.3),inset_0_-2px_0_rgb(0_0_0/0.15)] *:animate-arrive sm:mt-3 sm:py-1 sm:text-sm">
          {band}
        </p>
        {note ? <p className="text-muted-foreground animate-arrive mt-2.5 max-w-prose text-sm">{note}</p> : null}
      </header>
      <div className="animate-arrive col-span-2 flex flex-wrap items-center gap-2 lg:col-span-1 lg:col-start-2">
        <PlayKey from={from} tracks={tracks} className="max-sm:hidden" />
        {keys}
      </div>
      <div className="col-span-2 min-w-0 lg:col-span-1 lg:col-start-2">{children}</div>
    </div>
  );
}

/**
 * The page's layout, shared with its placeholder. The cover's column spans
 * every row on a wide screen, so it stands beside the tracks as they scroll;
 * on a phone it is only beside the name.
 */
const recordGrid =
  "grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-4 gap-y-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-x-6 lg:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)] lg:grid-rows-[auto_auto_1fr] lg:gap-x-9 lg:gap-y-5";
const recordAside = "min-w-0 self-start lg:sticky lg:top-6 lg:row-span-3";

/** The page while it loads: the cover (the real one, when the page can already show it), the name, the band, the keys and the list. */
export function RecordSkeleton({ cover, list }: { cover?: ReactNode; list: ReactNode }) {
  return (
    <div className={recordGrid} aria-hidden>
      <aside className={recordAside}>{cover ?? <Skeleton className="aspect-square rounded-[3px]" />}</aside>
      <div className="self-end lg:self-start">
        <Skeleton className="h-8 w-2/3 max-w-96 sm:h-11 lg:h-14" />
        <Skeleton className="mt-2.5 h-6 w-full sm:mt-3 sm:h-7" />
      </div>
      <div className="col-span-2 flex gap-2 lg:col-span-1 lg:col-start-2">
        <Skeleton className="h-[34px] w-11 sm:w-24" />
        <Skeleton className="h-[34px] w-11 sm:w-36" />
      </div>
      <div className="col-span-2 lg:col-span-1 lg:col-start-2">{list}</div>
    </div>
  );
}
