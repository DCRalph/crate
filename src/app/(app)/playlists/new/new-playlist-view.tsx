"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { usePendingTracks } from "~/components/library/pending-tracks";
import { AudiencePicker } from "~/components/playlists/audience-picker";
import { FolderSelect } from "~/components/playlists/folder-select";
import { PageCrumb } from "~/components/shell/crumb";
import { Field, FormActions, FormSection } from "~/components/shell/form";
import { Page } from "~/components/shell/page";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import type { Audience } from "~/lib/audience";
import { useTRPC } from "~/trpc/react";

/**
 * Names a new playlist and says where it goes and who can listen, which
 * starts as whatever its folder says. Tracks picked from a track's menu on the
 * way here are added as it is made.
 */
export function NewPlaylistView({ folderId: startFolder }: { folderId: number | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const pending = usePendingTracks();
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [folderId, setFolderId] = useState(startFolder);
  const [audience, setAudience] = useState<Audience | null>(null);
  const tree = useQuery(trpc.playlists.tree.queryOptions());
  const folder = tree.data?.folders.find((row) => row.id === folderId);
  const create = useMutation(
    trpc.playlists.create.mutationOptions({
      onSuccess: async (id) => {
        await queryClient.invalidateQueries(trpc.playlists.pathFilter());
        pending.clear();
        toast(`Created ${name.trim()}`);
        router.push(`/playlists/${id}`);
      },
    }),
  );

  return (
    <Page maxWidth="max-w-2xl">
      <PageCrumb label="New playlist" />
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({ name, comment, folderId, audience, trackIds: pending.trackIds });
        }}
      >
        <FormSection title="New playlist" className="grid gap-4">
          <Field label="Name" htmlFor="playlist-name" error={create.error?.message}>
            <Input id="playlist-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus />
          </Field>
          <Field label="Description" htmlFor="playlist-comment" hint="Optional.">
            <Textarea id="playlist-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={500} rows={2} />
          </Field>
          <Field label="Folder" htmlFor="playlist-folder">
            <FolderSelect id="playlist-folder" value={folderId} onChange={setFolderId} />
          </Field>
          <AudiencePicker
            id="playlist-audience"
            value={audience}
            onChange={setAudience}
            follows={folder ? { name: folder.name, audience: folder.audience } : null}
          />
          {pending.trackIds.length ? (
            <p className="text-muted-foreground text-sm">
              Starts with {pending.label}.{" "}
              <button type="button" className="hover:text-foreground underline underline-offset-4" onClick={pending.clear}>
                Start empty instead
              </button>
            </p>
          ) : null}
        </FormSection>
        <FormActions>
          <Button type="submit" variant="brand" disabled={!name.trim() || create.isPending}>
            Create playlist
          </Button>
          <Button variant="outline" asChild>
            <Link href="/playlists">Cancel</Link>
          </Button>
        </FormActions>
      </form>
    </Page>
  );
}
