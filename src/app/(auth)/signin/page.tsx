import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Mark } from "~/components/shell/mark";
import { getSession, safeNext } from "~/server/auth/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  if (await getSession()) redirect(next);

  return (
    <main className="grid min-h-svh place-items-center p-4">
      <div className="w-full max-w-xs">
        <Mark className="mb-5" />
        <div className="print rounded-lg p-5 shadow-[0_1px_2px_rgb(0_0_0/0.14)]">
          <SignInForm next={next} />
        </div>
        <p className="text-muted-foreground mt-5 text-xs">No account? Ask whoever runs this server.</p>
      </div>
    </main>
  );
}
