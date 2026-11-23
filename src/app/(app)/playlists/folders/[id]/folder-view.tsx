"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Folder, ListMusic } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "~/components/confirm-provider";
import { usePendingTracks } from "~/components/library/pending-tracks";
import { FolderSelect } from "~/components/playlists/folder-select";
import { PageCrumb } from "~/components/shell/crumb";
import { Field, FormActions, FormSection } from "~/components/shell/form";
import { ListRow, ListRows } from "~/components/shell/list-row";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { count } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { CardSkeleton } from "~/components/shell/skeletons";

/**
 * One folder: its name, where it sits, and what is directly inside it. A
 * folder that follows the disk shows the same, read-only.
 */
export function FolderView({ id }: { id: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const tree = useQuery(trpc.playlists.tree.queryOptions());
  const refresh = () => queryClient.invalidateQueries(trpc.playlists.pathFilter());
  const onError = (error: { message: string }) => toast.error(error.message);
  const update = useMutation(trpc.playlists.updateFolder.mutationOptions({ onSuccess: refresh, onError }));
  const remove = useMutation(
    trpc.playlists.deleteFolder.mutationOptions({
      // Not awaited: the page shows a placeholder from here until it has left (see below).
      onSuccess: () => {
        void refresh();
        router.push("/playlists");
      },
      onError,
    }),
  );
  const [name, setName] = useState<string | null>(null);

  // Removed and on the way out. The tree no longer has this folder, which isn't worth saying.
  if (remove.isSuccess) {
    return (
      <Page maxWidth="max-w-2xl">
        <CardSkeleton sections={2} />
      </Page>
    );
  }

  if (tree.isError) {
    return (
      <Page maxWidth="max-w-2xl">
        <LoadError error={tree.error} />
      </Page>
    );
  }
  if (!tree.data) {
    return (
      <Page maxWidth="max-w-2xl">
        <CardSkeleton sections={2} />
      </Page>
    );
  }
  const folder = tree.data.folders.find((row) => row.id === id);
  if (!folder) {
    return (
      <Page maxWidth="max-w-2xl">
        <LoadError error={{ message: "Folder not found.", data: { code: "NOT_FOUND" } }} />
      </Page>
    );
  }
  const folders = tree.data.folders.filter((row) => row.parentId === id);
  const playlists = tree.data.playlists.filter((row) => row.folderId === id);
  const shownName = name ?? folder.name;

  return (
    <Page maxWidth="max-w-2xl" className="flex flex-col gap-6">
      <PageCrumb label={folder.name} />

      {folder.canEdit ? (
        <FormSection title="Folder" className="grid gap-4">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              update.mutate({ id, name: shownName }, { onSuccess: () => toast("Saved") });
            }}
          >
            <Field label="Name" htmlFor="folder-name">
              <Input id="folder-name" value={shownName} onChange={(event) => setName(event.target.value)} maxLength={120} />
            </Field>
            <FormActions>
              <Button type="submit" disabled={!shownName.trim() || shownName === folder.name || update.isPending}>
                Save name
              </Button>
            </FormActions>
          </form>
          <Field label="Inside" htmlFor="folder-parent" hint="Moving a folder takes everything in it along.">
            <FolderSelect
              id="folder-parent"
              value={folder.parentId}
              exclude={id}
              onChange={(parentId) => update.mutate({ id, parentId }, { onSuccess: () => toast(`Moved ${folder.name}`) })}
            />
          </Field>
        </FormSection>
      ) : (
        <FormSection
          title={folder.name}
          description={
            folder.fromDisk
              ? "This folder follows a folder on disk. It changes when the files do, so it can't be renamed, moved or removed here."
              : `This folder belongs to ${folder.ownerName}.`
          }
        >
          {folder.ruleId !== null ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/folder-playlists/${folder.ruleId}`}>Open its folder rule</Link>
            </Button>
          ) : null}
        </FormSection>
      )}

      <FormSection
        title="Inside"
        description={[count(folders.length, "folder"), count(playlists.length, "playlist")].join(", ")}
        action={
          folder.canEdit ? (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/playlists/folders/new?parent=${id}`}>New folder</Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/playlists/new?folder=${id}`} onClick={() => usePendingTracks.getState().clear()}>
                  New playlist
                </Link>
              </Button>
            </div>
          ) : null
        }
      >
        {folders.length || playlists.length ? (
          <ListRows>
            {folders.map((row) => (
              <ListRow key={`f${row.id}`} icon={<Folder />} title={<Link href={`/playlists/folders/${row.id}`} className="hover:underline">{row.name}</Link>} detail="Folder" />
            ))}
            {playlists.map((row) => (
              <ListRow
                key={`p${row.id}`}
                icon={<ListMusic />}
                title={<Link href={`/playlists/${row.id}`} className="hover:underline">{row.name}</Link>}
                detail={count(row.trackCount, "track")}
              />
            ))}
          </ListRows>
        ) : (
          <p className="text-muted-foreground text-sm">Nothing yet.</p>
        )}
      </FormSection>

      {folder.canEdit ? (
        <FormSection title="Remove" description="The folder goes. What is inside it moves up a level; no playlist is deleted.">
          <Button
            variant="outline"
            onClick={async () => {
              const ok = await confirm({
                title: `Remove ${folder.name}?`,
                description: "What is inside it moves up a level.",
                confirmLabel: "Remove",
                variant: "destructive",
              });
              if (ok) remove.mutate({ id }, { onSuccess: () => toast(`Removed ${folder.name}`) });
            }}
          >
            Remove folder
          </Button>
        </FormSection>
      ) : null}
    </Page>
  );
}
