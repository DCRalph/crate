"use client";

import { useState } from "react";
import { Disc3 } from "lucide-react";

import { cn } from "~/lib/utils";

/** The colour each picture reads as, by address, so a cover seen before glows straight away. */
const artColours = new Map<string, string>();

/**
 * The colour a loaded picture reads as, for lighting it from underneath: the
 * average of a tiny copy, weighted toward its most colourful parts and lifted
 * so it shows on dark glass. Null when the picture can't be read.
 */
function readArt(image: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 8;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, 8, 8);
    const pixels = context.getImageData(0, 0, 8, 8).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let total = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b] = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
      const weight = 0.15 + (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      red += r * weight;
      green += g * weight;
      blue += b * weight;
      total += weight;
    }
    const [h, s] = toHsl(red / total, green / total, blue / total);
    // Never so dark it vanishes on the glass, never washed out.
    return `hsl(${Math.round(h)} ${Math.round(Math.min(85, Math.max(40, s * 120)))}% 58%)`;
  } catch {
    return null;
  }
}

/** Hue in degrees and saturation from 0 to 1, from sRGB channels. */
function toHsl(r: number, g: number, b: number): [number, number] {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const light = (max + min) / 2;
  if (max === min) return [0, 0];
  const delta = max - min;
  const saturation = delta / (1 - Math.abs(2 * light - 1));
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const hue = max === rr ? ((gg - bb) / delta) % 6 : max === gg ? (bb - rr) / delta + 2 : (rr - gg) / delta + 4;
  return [(hue * 60 + 360) % 360, saturation];
}

/**
 * Square cover art for an album, artist, track or playlist. Shows a plain
 * tile until the image arrives, fades the image in, and keeps the tile when
 * there is no art. `imageClassName` styles the image itself (e.g. a hover zoom).
 *  - `glow` lights the cover from underneath in its own colour, on glass.
 *    "lit" is the cover of what is playing: amber ring and more light.
 *  - `onArt` hears the colour the picture reads as, for a tile that does
 *    its own lighting around more than the cover.
 */
export function Cover({
  type,
  id,
  size,
  version,
  seed,
  glow,
  onArt,
  className,
  imageClassName,
}: {
  type: "album" | "artist" | "track" | "playlist";
  id: number;
  /** Anything that changes when the picture does, so a changed cover is fetched again. */
  version?: string;
  /** For a playlist: one particular generated cover, to show it before it is chosen. */
  seed?: number;
  /** Pixels to request. Twice the displayed size keeps it sharp on dense screens. */
  size: number;
  glow?: boolean | "lit";
  onArt?: (colour: string) => void;
  className?: string;
  imageClassName?: string;
}) {
  const src = `/api/cover/${type}/${id}?size=${size}${seed === undefined ? "" : `&seed=${seed}`}${version ? `&v=${encodeURIComponent(version)}` : ""}`;
  // Tracked per source, so a cover that changes target starts hidden again.
  const [state, setState] = useState<{ src: string; status: "loaded" | "failed" } | null>(null);
  const status = state?.src === src ? state.status : "loading";
  // The colour lives in `artColours`; this only draws the cover again once it is known.
  const [, setArtKnown] = useState<string | null>(null);
  const art = artColours.get(src);

  const loaded = (image: HTMLImageElement) => {
    setState({ src, status: "loaded" });
    if (!glow && !onArt) return;
    const colour = artColours.get(src) ?? readArt(image);
    if (!colour) return;
    artColours.set(src, colour);
    setArtKnown(src);
    onArt?.(colour);
  };

  return (
    <span
      className={cn(
        "bg-secondary text-foreground/20 relative grid aspect-square shrink-0 place-items-center overflow-hidden rounded-[3px] transition-shadow duration-300",
        glow === "lit" ? "glow-lit" : glow ? "glow" : null,
        className,
      )}
      style={glow && art ? ({ "--art": art } as React.CSSProperties) : undefined}
    >
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
            if (image?.complete && image.naturalWidth > 0 && status === "loading") loaded(image);
          }}
          onLoad={(event) => loaded(event.currentTarget)}
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
