import "server-only";
import { z } from "zod";

// Server env, validated once at import. Anything missing fails loudly at boot.
export const env = z
  .object({
    DATABASE_URL: z.url(),
    // Signs sessions and encrypts app passwords at rest.
    BETTER_AUTH_SECRET: z.string().min(32),
    // Public origin of the server, e.g. https://music.example.com.
    BETTER_AUTH_URL: z.url(),
    // Other hosts people may sign in through, comma separated, e.g. "music.lan,nas.tailnet.ts.net".
    // Private network addresses and .local names are always allowed (src/lib/local-hosts.ts).
    ALLOWED_HOSTS: z
      .string()
      .default("")
      .transform((list) => list.split(",").map((host) => host.trim()).filter(Boolean)),
    // Cover art cache. Safe to delete.
    DATA_DIR: z.string().min(1).default("./data"),
    // Rescan every library on this interval. Unset means scans are started by hand.
    SCAN_INTERVAL_MINUTES: z.coerce.number().int().positive().optional(),
  })
  .parse(process.env);
