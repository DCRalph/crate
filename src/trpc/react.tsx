"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import superjson from "superjson";

import type { AppRouter } from "~/server/api/root";
import { isFinal } from "./failure";

/**
 * The web app's data layer. In a client component:
 *   const trpc = useTRPC();
 *   const albums = useQuery(trpc.library.albums.queryOptions({ sort: "added" }));
 */
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

/** What each procedure returns, for typing rows: `RouterOutputs["playlists"]["tree"]`. */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      // A music library changes rarely; refetching on every focus would only add flicker. A failure is tried
      // once more, unless it is an answer that won't change, which is shown straight away.
      queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: (failures, error) => failures < 1 && !isFinal(error) },
    },
  });

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  const [client] = useState(() =>
    createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })] }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={client} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
