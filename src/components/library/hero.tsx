import type { ReactNode } from "react";

import type { WebTrack } from "~/server/api/routers/library";
import { PlayKey } from "./play-key";

/**
 * The top of an album or playlist page, as a printed card: the cover, the
 * name lettered large, the facts on the coral band, and the keys under them.
 * `from` and `tracks` are what its Play key plays. The lettering fades in,
 * because the card takes the place of a placeholder of the same shape.
 *
 * On a phone the card is kept short: the cover is small and to one side, and
 * the Play key sits on its corner, the way it does on a tile.
 */
export function Hero({
  cover,
  title,
  band,
  note,
  from,
  tracks,
  children,
}: {
  cover: ReactNode;
  title: string;
  band: ReactNode;
  note?: ReactNode;
  from: string;
  tracks: WebTrack[];
  children?: ReactNode;
}) {
  return (
    <div className={heroCard}>
      <div className={heroCover}>
        {cover}
        <PlayKey from={from} tracks={tracks} compact className="absolute right-1.5 bottom-1.5 sm:hidden" />
      </div>
      <div className="min-w-0 sm:self-end">
        <h1 className="font-title animate-arrive text-[26px] leading-[1.05] text-balance break-words sm:text-[38px] sm:leading-tight">{title}</h1>
        <p className="bg-brand mt-2 flex flex-wrap gap-x-3 rounded-[3px] px-2 py-0.5 text-[12.5px] font-medium tabular-nums *:animate-arrive sm:gap-x-4 sm:px-2.5 sm:py-1 sm:text-sm">
          {band}
        </p>
        {note ? <p className="text-muted-foreground animate-arrive mt-2 max-w-prose text-sm">{note}</p> : null}
      </div>
      <div className="animate-arrive flex flex-wrap items-center gap-2 self-end sm:col-start-2">
        <PlayKey from={from} tracks={tracks} className="max-sm:hidden" />
        {children}
      </div>
    </div>
  );
}

/** The card's layout, shared with its placeholder: the cover in a column of its own, down the side of the lettering and the keys. */
export const heroCard =
  "print mb-4 grid grid-cols-[7.5rem_minmax(0,1fr)] grid-rows-[1fr_auto] gap-x-3.5 gap-y-2.5 rounded-lg p-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.14)] sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-5 sm:gap-y-4 sm:p-5";
/** The cover's cell. What goes in it is as wide as the cell on a phone, and its own size above that. */
export const heroCover = "relative row-span-2 self-start sm:self-end *:first:w-full sm:*:first:w-48";
