"use client";

import { useEffect } from "react";

import { Page } from "~/components/shell/page";
import { Button } from "~/components/ui/button";

/** A page that failed to draw. The shell and the player carry on around it. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <Page maxWidth="max-w-2xl">
      <div className="flex flex-col items-start gap-4 py-10">
        <div>
          <h1 className="font-title text-2xl font-semibold">The needle skipped</h1>
          <p className="text-muted-foreground mt-1 text-sm">This page hit a problem. Whatever is playing carries on.</p>
        </div>
        <Button onClick={reset}>Try again</Button>
      </div>
    </Page>
  );
}
