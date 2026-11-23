import Link from "next/link";

import { Page } from "~/components/shell/page";
import { Button } from "~/components/ui/button";

/** An address inside the app that leads nowhere. The tabs and the deck stay where they are. */
export default function NotFound() {
  return (
    <Page maxWidth="max-w-2xl" title="none">
      <div className="print flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border px-5 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="t-label text-[12.5px]">Not in the crate</h1>
          <p className="text-muted-foreground text-sm">There is nothing at this address. It may have been moved or removed.</p>
        </div>
        <Button asChild variant="brand" size="sm">
          <Link href="/albums">Back to albums</Link>
        </Button>
      </div>
    </Page>
  );
}
