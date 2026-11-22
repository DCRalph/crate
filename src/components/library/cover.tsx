"use client";

import { useState } from "react";
import { Disc3 } from "lucide-react";

import { cn } from "~/lib/utils";

/**
 * Square cover art for an album, artist, track or playlist. Shows a plain
 * tile until the image arrives, fades the image in, and keeps the tile when
 * there is no art. `imageClassName` styles the image itself (e.g. a hover zoom).
 */
export function Cover({
  type,
  id,
  size,
  className,
  imageClassName,
}: {
  type: "album" | "artist" | "track" | "playlist";
  id: number;
  /** Pixels to request. Twice the displayed size keeps it sharp on dense screens. */
  size: number;
  className?: string;
  imageClassName?: string;
}) {
  const src = `/api/cover/${type}/${id}?size=${size}`;
  // Tracked per source, so a cover that changes target starts hidden again.
  const [state, setState] = useState<{ src: string; status: "loaded" | "failed" } | null>(null);
  const status = state?.src === src ? state.status : "loading";

  return (
    <span className={cn("bg-secondary text-foreground/20 relative grid aspect-square shrink-0 place-items-center overflow-hidden rounded-md", className)}>
      <Disc3 className="size-1/3" />
      {status === "failed" ? null : (
        // Served by our own resizing route behind the session cookie, so next/image would add nothing.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          // An image already in the browser's cache can finish before React attaches onLoad.
          ref={(image) => {
            if (image?.complete && image.naturalWidth > 0 && status === "loading") setState({ src, status: "loaded" });
          }}
          onLoad={() => setState({ src, status: "loaded" })}
          onError={() => setState({ src, status: "failed" })}
          className={cn(
            "absolute inset-0 size-full object-cover transition-[opacity,transform] duration-300 ease-(--ease-out-expo)",
            status === "loaded" ? "opacity-100" : "opacity-0",
            imageClassName,
          )}
        />
      )}
    </span>
  );
}
