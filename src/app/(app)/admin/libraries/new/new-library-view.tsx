"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { FolderBrowser } from "~/components/admin/folder-browser";
import { PageCrumb } from "~/components/shell/crumb";
import { Field, FormActions, FormSection } from "~/components/shell/form";
import { Page } from "~/components/shell/page";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useTRPC } from "~/trpc/react";

/** Adds a folder on the server as a library and starts scanning it. */
export function NewLibraryView() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const create = useMutation(
    trpc.admin.libraries.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries(trpc.admin.libraries.pathFilter());
        toast(`Added ${name.trim()}. Scanning now.`);
        router.push(`/admin/libraries/${created.id}`);
      },
    }),
  );

  return (
    <Page maxWidth="max-w-2xl">
      <PageCrumb label="Add library" />
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({ name, path });
        }}
      >
        <FormSection title="Add library" description="A library is one folder of music on the server. Nobody but admins can reach it until you give them access." className="grid gap-4">
          <Field label="Name" htmlFor="library-name">
            <Input id="library-name" placeholder="Main" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoFocus />
          </Field>
          <Field label="Folder" htmlFor="library-path" error={create.error?.message} hint="Type the full path, or open folders below to pick one.">
            <Input id="library-path" placeholder="/music/library" className="font-mono" autoCapitalize="none" spellCheck={false} value={path} onChange={(event) => setPath(event.target.value)} />
          </Field>
          <FolderBrowser value={path} onChange={setPath} />
        </FormSection>
        <FormActions>
          <Button type="submit" variant="brand" disabled={!name.trim() || !path.trim() || create.isPending}>
            Add and scan
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/libraries">Cancel</Link>
          </Button>
        </FormActions>
      </form>
    </Page>
  );
}
