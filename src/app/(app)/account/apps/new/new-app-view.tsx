"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageCrumb } from "~/components/shell/crumb";
import { Field, FormActions, FormSection } from "~/components/shell/form";
import { Page } from "~/components/shell/page";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useTRPC } from "~/trpc/react";
import { CopyField } from "../copy-field";

/**
 * Two steps on one page: name the app, then see its password, once, beside
 * the server address and username the app also asks for.
 */
export function NewAppView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const connection = useQuery(trpc.account.connection.queryOptions());
  const [name, setName] = useState("");
  const create = useMutation(
    trpc.account.createAppPassword.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.account.appPasswords.pathFilter()),
    }),
  );
  const secret = create.data?.secret;

  return (
    <Page maxWidth="max-w-2xl">
      <PageCrumb label="New app" />
      {/* Announced as it changes, so the password's arrival isn't silent to a screen reader. */}
      <div aria-live="polite">
        {secret ? (
          <div className="flex flex-col gap-6">
            <FormSection title={`Password for ${name.trim()}`} description="Enter these in the app. The password won't be shown again.">
              {connection.data ? (
                <>
                  <CopyField label="Server" value={connection.data.serverUrl} />
                  <CopyField label="Username" value={connection.data.username} />
                </>
              ) : null}
              <CopyField label="Password" value={secret} />
            </FormSection>
            <FormActions>
              <Button variant="brand" asChild>
                <Link href="/account/apps">Done</Link>
              </Button>
            </FormActions>
          </div>
        ) : (
          <form
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate({ name });
            }}
          >
            <FormSection title="Add app" description="Each app signs in with its own password, so you can cut one off without touching the others.">
              <Field label="App or device" htmlFor="app-name" error={create.error?.message} hint="A name to tell it apart by later.">
                <Input id="app-name" placeholder="Phone" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
              </Field>
            </FormSection>
            <FormActions>
              <Button type="submit" variant="brand" disabled={!name.trim() || create.isPending}>
                Create password
              </Button>
              <Button variant="outline" asChild>
                <Link href="/account/apps">Cancel</Link>
              </Button>
            </FormActions>
          </form>
        )}
      </div>
    </Page>
  );
}
