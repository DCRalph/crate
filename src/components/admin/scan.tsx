"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { LocalTime } from "~/components/local-time";
import { Status } from "~/components/shell/status";
import { scanSummary } from "~/lib/format";
import type { RouterOutputs } from "~/trpc/react";

type Library = RouterOutputs["admin"]["libraries"]["list"]["libraries"][number];
type Scan = RouterOutputs["admin"]["libraries"]["list"]["scan"];

const number = new Intl.NumberFormat("en");

/** Where a library's scanning stands: running with real progress, failed, done with what it did, or never run. */
export function ScanStatus({ library, running }: { library: Pick<Library, "id" | "lastScan" | "lastScanAt">; running: Scan }) {
  if (running?.libraryId === library.id) {
    return (
      <div className="w-56 max-w-full">
        <Status
          tone="warn"
          label={running.phase === "listing" ? "Finding files" : running.phase === "cleaning" ? "Tidying up" : "Scanning"}
          reason={<span className="tabular-nums">{`${number.format(running.done)} of ${number.format(running.total)}`}</span>}
        />
        {/* How far through, for real: files read over files found. */}
        <div className="bg-secondary mt-1.5 h-0.5 overflow-hidden rounded-full">
          <div
            className="bg-brand h-full origin-left transition-transform duration-700 ease-out"
            style={{ transform: `scaleX(${running.total ? running.done / running.total : 0})` }}
          />
        </div>
      </div>
    );
  }
  if (library.lastScan?.error) return <Status tone="bad" label="Failed" reason={library.lastScan.error} className="whitespace-normal" />;
  if (library.lastScan && library.lastScanAt) {
    return (
      <Status
        tone={library.lastScan.failed ? "warn" : "ok"}
        label={<LocalTime date={library.lastScanAt} format="relative" />}
        reason={<span className="tabular-nums">{scanSummary(library.lastScan)}</span>}
      />
    );
  }
  return <Status tone="neutral" label="Not scanned" />;
}

/**
 * Says so when a scan finishes, with what it did. Noticed by `lastScanAt`
 * moving, since a quick scan can start and finish between two looks at the server.
 */
export function useScanAnnouncements(libraries: Pick<Library, "id" | "name" | "lastScan" | "lastScanAt">[] | undefined) {
  const lastSeen = useRef<Map<number, number> | null>(null);
  useEffect(() => {
    if (!libraries) return;
    const before = lastSeen.current;
    lastSeen.current = new Map(libraries.map((library) => [library.id, library.lastScanAt?.getTime() ?? 0]));
    // The first load only records where things stand.
    if (!before) return;
    for (const library of libraries) {
      // A library added since the last look counts as never scanned, so its first scan is announced too.
      const previous = before.get(library.id) ?? 0;
      if (!library.lastScan || previous === (library.lastScanAt?.getTime() ?? 0)) continue;
      if (library.lastScan.error) toast.error(`${library.name}: ${library.lastScan.error}`);
      else toast(`${library.name} scanned. ${scanSummary(library.lastScan)}.`);
    }
  }, [libraries]);
}
