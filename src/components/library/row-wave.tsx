import { memo, useMemo } from "react";

/**
 * A track's small waveform, drawn on its row: one bar for each of its 64
 * numbers, about a centre line, in the text colour. Quiet passages still
 * show as a hairline, so the shape of the whole track reads at a glance.
 */
export const RowWave = memo(function RowWave({ peaks }: { peaks: number[] }) {
  const path = useMemo(
    () =>
      peaks
        .map((peak, i) => {
          const height = Math.max(6, (peak / 255) * 100);
          return `M${i * 2} ${(100 - height) / 2}h1.25v${height}h-1.25z`;
        })
        .join(""),
    [peaks],
  );
  return (
    <svg viewBox={`0 0 ${peaks.length * 2} 100`} preserveAspectRatio="none" className="block h-3.5 w-28" aria-hidden>
      <path d={path} fill="currentColor" />
    </svg>
  );
});
