import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const handler = (request: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: request.headers }),
    onError: ({ path, error }) => {
      if (error.code === "INTERNAL_SERVER_ERROR") console.error(`[trpc] ${path ?? "?"} failed:`, error);
    },
  });

export { handler as GET, handler as POST };
