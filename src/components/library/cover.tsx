"use client";

import { useState } from "react";
import { Disc3 } from "lucide-react";

import { cn } from "~/lib/utils";

/**
 * Square cover art for an album, artist, track or playlist. Shows a plain
 * tile until the image arrives, and keeps it when there is no art.
 */
export function Cover({
  type,
  id,
  size,
  className,
}: {
  type: "album" | "artist" | "track" | "playlist";
  id: number;
  /** Pixels to request. Twice the displayed size keeps it sharp on dense screens. */
  size: number;
  className?: string;
}) {
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const src = `/api/cover/${type}/${id}?size=${size}`;
  return (
    <span className={cn("bg-secondary text-foreground/20 relative grid aspect-square shrink-0 place-items-center overflow-hidden rounded-md", className)}>
      <Disc3 className="size-1/3" />
      {failedFor === src ? null : (
        // Served by our own resizing route behind the session cookie, so next/image would add nothing.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailedFor(src)}
        />
      )}
    </span>
  );
}
