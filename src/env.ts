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
    // Cover art cache. Safe to delete.
    DATA_DIR: z.string().min(1).default("./data"),
    // Rescan every library on this interval. Unset means scans are started by hand.
    SCAN_INTERVAL_MINUTES: z.coerce.number().int().positive().optional(),
  })
  .parse(process.env);
