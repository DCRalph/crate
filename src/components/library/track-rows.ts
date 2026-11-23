import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";

import { useTRPC, type RouterOutputs } from "~/trpc/react";

/** The most tracks one request for row extras takes. */
const batch = 500;

type TrackRows = RouterOutputs["library"]["trackRows"];
/** The batches' answers as one map. Defined once, so the query keeps handing back the same map until an answer changes. */
const combine = (results: { data?: TrackRows }[]): TrackRows => Object.assign({}, ...results.map((result) => result.data ?? {}));

/**
 * What track rows draw beside each track (its small waveform and how often
 * you have played it), for a whole list however long: asked for in batches,
 * all at once, and handed back as one map by track id.
 */
export function useTrackRows(trackIds: number[]) {
  const trpc = useTRPC();
  const batches = useMemo(() => {
    const unique = [...new Set(trackIds)];
    return Array.from({ length: Math.ceil(unique.length / batch) }, (_, i) => unique.slice(i * batch, (i + 1) * batch));
  }, [trackIds]);
  return useQueries({
    queries: batches.map((ids) => trpc.library.trackRows.queryOptions({ trackIds: ids }, { staleTime: 60_000 })),
    combine,
  });
}
