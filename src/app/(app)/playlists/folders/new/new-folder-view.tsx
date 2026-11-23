"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AudiencePicker } from "~/components/playlists/audience-picker";
import { FolderSelect } from "~/components/playlists/folder-select";
import { PageCrumb } from "~/components/shell/crumb";
import { Field, FormActions, FormSection } from "~/components/shell/form";
import { Page } from "~/components/shell/page";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { Audience } from "~/lib/audience";
import { useTRPC } from "~/trpc/react";

/** Names a new folder and says which folder it goes inside and who can listen, which starts as whatever that folder says. */
export function NewFolderView({ parentId: startParent }: { parentId: number | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState(startParent);
  const [audience, setAudience] = useState<Audience | null>(null);
  const tree = useQuery(trpc.playlists.tree.queryOptions());
  const parent = tree.data?.folders.find((row) => row.id === parentId);
  const create = useMutation(
    trpc.playlists.createFolder.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.playlists.pathFilter());
        toast(`Created ${name.trim()}`);
        router.push("/playlists");
      },
    }),
  );

  return (
    <Page maxWidth="max-w-2xl">
      <PageCrumb label="New folder" />
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({ name, parentId, audience });
        }}
      >
        <FormSection title="New folder" description="Folders hold playlists and other folders." className="grid gap-4">
          <Field label="Name" htmlFor="folder-name" error={create.error?.message}>
            <Input id="folder-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus />
          </Field>
          <Field label="Inside" htmlFor="folder-parent">
            <FolderSelect id="folder-parent" value={parentId} onChange={setParentId} />
          </Field>
          <AudiencePicker
            id="folder-audience"
            value={audience}
            onChange={setAudience}
            follows={parent ? { name: parent.name, audience: parent.audience } : null}
            holds="folder"
          />
        </FormSection>
        <FormActions>
          <Button type="submit" variant="brand" disabled={!name.trim() || create.isPending}>
            Create folder
          </Button>
          <Button variant="outline" asChild>
            <Link href="/playlists">Cancel</Link>
          </Button>
        </FormActions>
      </form>
    </Page>
  );
}
