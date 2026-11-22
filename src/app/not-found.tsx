import Link from "next/link";

import { Mark } from "~/components/shell/mark";
import { Button } from "~/components/ui/button";

/** Any address that leads nowhere. */
export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <div className="animate-rise flex max-w-sm flex-col items-start gap-4">
        <Mark />
        <div>
          <h1 className="font-title text-3xl">Not in the crate</h1>
          <p className="text-muted-foreground mt-1 text-sm">There is nothing at this address. It may have been moved or removed.</p>
        </div>
        <Button asChild variant="brand">
          <Link href="/albums">Back to albums</Link>
        </Button>
      </div>
    </main>
  );
}
