import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import superjson from "superjson";

import type { AppRouter } from "~/server/api/root";
import { authHeaders, type Server } from "./servers";

/**
 * The server's own API, typed. `AppRouter` is imported as a type only, so
 * none of the server's code is in the app; TypeScript erases the import.
 * In a screen:
 *   const trpc = useTRPC();
 *   const album = useQuery(trpc.library.album.queryOptions({ id }));
 */
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export type RouterOutputs = inferRouterOutputs<AppRouter>;
/** A track as lists and the player hold it. */
export type Track = RouterOutputs["library"]["album"]["tracks"][number];
export type Album = RouterOutputs["library"]["home"]["added"][number];
export type Playlist = RouterOutputs["playlists"]["tree"]["playlists"][number];

const clients = new Map<string, TRPCClient<AppRouter>>();

/**
 * The client for one server, for code that isn't a screen (the player, the
 * downloads). Screens get the same one through `ServerProvider`.
 */
export function clientFor(server: Server) {
  const key = `${server.id}:${server.token}`;
  let client = clients.get(key);
  if (!client) {
    // Not the streaming link the website uses: a phone's fetch has no readable body to stream from.
    client = createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: `${server.url}/api/trpc`, transformer: superjson, headers: () => authHeaders(server) })],
    });
    clients.set(key, client);
  }
  return client;
}

/**
 * Everything under it talks to `server`. Give it the server's id as its key,
 * so changing server starts with nothing remembered from the last one.
 */
export function ServerProvider({ server, children }: { server: Server; children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // A phone changes network all the time, so what is on screen is kept and refreshed when it is back.
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnReconnect: true } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={clientFor(server)} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
