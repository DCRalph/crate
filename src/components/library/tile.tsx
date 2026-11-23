"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { SharedCover } from "~/components/shell/transitions";
import { cn } from "~/lib/utils";
import { Cover } from "./cover";

/** The grid tiles sit in: two across on a phone, up to six on a wide screen. */
export const tileGrid = "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";
/** One row of the grid: see `one-row` in globals.css. */
export const oneRow = "one-row";

/**
 * One tile in a grid of albums or playlists: the cover, lit from underneath
 * in its own colour, with its selection code on a plate in its corner, and the title strip
 * under it (the name on ivory, `band` on coral). The tile that is playing
 * (`lit`) has an amber ring and more light. `overlay` is what sits on the
 * cover (a play key, a pin), as siblings of the link since a button can't sit
 * inside an anchor. `cover` is a picture to load, or `mosaic` for a folder
 * made of the covers inside it. Tiles arrive one after another (`index`),
 * like pages being turned.
 */
export function Tile({
  href,
  cover,
  shared,
  name,
  band,
  code,
  codeIcon,
  lit = false,
  overlay,
  index,
  className,
  ...data
}: {
  href: string;
  cover: { type: "album" | "playlist"; id: number; version?: string } | { mosaic: ReactNode };
  /** Names the cover for the page transition, so it travels to the page the tile opens. */
  shared?: string;
  name: string;
  band: ReactNode;
  /** The tile's selection code ("B3"), on its plate and read out with its name. */
  code?: string;
  /** A sign on the plate before the code: a folder, Most played. */
  codeIcon?: ReactNode;
  lit?: boolean;
  overlay?: ReactNode;
  index: number;
  className?: string;
} & { [key: `data-${string}`]: string | number }) {
  const [art, setArt] = useState<string | null>(null);
  return (
    <li
      {...data}
      className={cn("group animate-rise relative min-w-0", className)}
      // The first row or two stagger; anything later arrives together rather than keeping people waiting.
      style={{ animationDelay: `${Math.min(index % 60, 11) * 28}ms` }}
    >
      <Link
        href={href}
        className={cn(
          "focus-visible:ring-ring/60 block rounded-[3px] outline-none transition-shadow duration-300 focus-visible:ring-[3px]",
          lit ? "glow-lit" : "glow",
        )}
        style={art ? ({ "--art": art } as React.CSSProperties) : undefined}
      >
        {"mosaic" in cover ? (
          cover.mosaic
        ) : (
          <SharedCover name={shared}>
            <Cover
              type={cover.type}
              id={cover.id}
              version={cover.version}
              size={400}
              onArt={setArt}
              className="w-full rounded-b-none"
              imageClassName="group-hover:scale-[1.04]"
            />
          </SharedCover>
        )}
        <span className="print block overflow-hidden rounded-b-[3px]">
          <span className="t-label block truncate px-2 text-[12.5px] leading-6">{name}</span>
          <span className="bg-brand block truncate px-2 text-xs leading-5 font-medium">{band || "\u00a0"}</span>
        </span>
        {code ? <span className="sr-only">, selection {code}</span> : null}
      </Link>
      {code || codeIcon ? (
        <span className={cn("plate pointer-events-none absolute top-1.5 left-1.5 gap-1", codeIcon && code && "flex", lit && "text-lamp")} aria-hidden>
          {codeIcon}
          {code}
        </span>
      ) : null}
      {overlay ? <div className="pointer-events-none absolute inset-x-0 top-0 aspect-square">{overlay}</div> : null}
    </li>
  );
}
