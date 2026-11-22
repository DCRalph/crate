import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Mark } from "~/components/shell/mark";
import { site } from "~/lib/site";
import { getSession, safeNext } from "~/server/auth/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  if (await getSession()) redirect(next);

  return (
    <main className="grid min-h-svh place-items-center p-4">
      <div className="w-full max-w-xs">
        <div className="mb-8 flex items-center gap-3">
          <Mark spin="arrive" className="size-9" />
          <p className="t-display text-lg">{site.name}</p>
        </div>
        <SignInForm next={next} />
        <p className="text-muted-foreground mt-6 text-xs">No account? Ask whoever runs this server.</p>
      </div>
    </main>
  );
}
