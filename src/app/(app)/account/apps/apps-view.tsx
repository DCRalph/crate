"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { AppPasswordTable } from "~/components/shell/app-passwords";
import { FormSection } from "~/components/shell/form";
import { Page } from "~/components/shell/page";
import { RowsSkeleton } from "~/components/shell/skeletons";
import { LoadError, SectionHeading } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { count } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { CopyField } from "./copy-field";

/** What a music app needs to sign in: the address and username to enter, and the app passwords made so far. */
export function AppsView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const connection = useQuery(trpc.account.connection.queryOptions());
  const passwords = useQuery(trpc.account.appPasswords.queryOptions());
  const revoke = useMutation(
    trpc.account.revokeAppPassword.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.account.appPasswords.pathFilter()),
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <Page maxWidth="max-w-4xl" className="flex flex-col gap-6">
      <FormSection
        title="Connect an app"
        description="Any Subsonic app can play from this server. Each app signs in with its own password, so you can cut one off without touching the others."
      >
        {connection.isError ? (
          <LoadError error={connection.error} />
        ) : connection.data ? (
          <>
            <CopyField label="Server" value={connection.data.serverUrl} />
            <CopyField label="Username" value={connection.data.username} />
          </>
        ) : (
          <Skeleton className="h-16" />
        )}
      </FormSection>

      <section>
        <SectionHeading title="App passwords" detail={passwords.data ? count(passwords.data.length, "app") : null}>
          <Button variant="brand" size="sm" asChild>
            <Link href="/account/apps/new">
              <Plus />
              Add app
            </Link>
          </Button>
        </SectionHeading>
        {passwords.isError ? (
          <LoadError error={passwords.error} />
        ) : passwords.data ? (
          <AppPasswordTable
            rows={passwords.data}
            onRevoke={(row) => revoke.mutate({ id: row.id }, { onSuccess: () => toast(`Revoked ${row.name}`) })}
            emptyMessage="No app passwords yet."
          />
        ) : (
          <RowsSkeleton rows={2} />
        )}
      </section>
    </Page>
  );
}
