"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderTree, Plus } from "lucide-react";
import { toast } from "sonner";

import { FolderBrowser } from "~/components/admin/folder-browser";
import { ScanStatus, useScanAnnouncements } from "~/components/admin/scan";
import { useConfirm } from "~/components/confirm-provider";
import { PageCrumb } from "~/components/shell/crumb";
import { Field, FormActions, FormSection } from "~/components/shell/form";
import { ListRow, ListRows } from "~/components/shell/list-row";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { count } from "~/lib/format";
import { ruleModes } from "~/components/admin/folder-rule-parts";
import { useTRPC, type RouterOutputs } from "~/trpc/react";
import { CardSkeleton } from "~/components/shell/skeletons";

type Library = RouterOutputs["admin"]["libraries"]["byId"];
const number = new Intl.NumberFormat("en");

/** One library: its name and folder, its scans, who can reach it, the folder rules on it, and removing it. */
export function LibraryView({ id }: { id: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const library = useQuery(
    trpc.admin.libraries.byId.queryOptions(
      { id },
      // While a scan runs, the counts are the progress display.
      { refetchInterval: (query) => (query.state.data?.scan ? 1000 : false) },
    ),
  );
  const rules = useQuery(trpc.admin.folderRules.list.queryOptions({ libraryId: id }));
  const refresh = () => queryClient.invalidateQueries(trpc.admin.pathFilter());
  const onError = (error: { message: string }) => toast.error(error.message);
  const scan = useMutation(
    trpc.admin.libraries.scan.mutationOptions({
      // A quick scan can finish before the page ever sees it running, so look again shortly.
      onSuccess: () => {
        void refresh();
        setTimeout(refresh, 1500);
        setTimeout(refresh, 4000);
      },
      onError,
    }),
  );
  const setAccess = useMutation(trpc.admin.users.setAccess.mutationOptions({ onSuccess: refresh, onError }));
  const remove = useMutation(
    trpc.admin.libraries.delete.mutationOptions({
      // Not awaited: the page shows a placeholder from here until it has left (see below).
      onSuccess: () => {
        void refresh();
        router.push("/admin/libraries");
      },
      onError,
    }),
  );
  const data = library.data;
  useScanAnnouncements(data ? [data] : undefined);

  // Removed and on the way out. Asking for the library again would only say it isn't there.
  if (remove.isSuccess) {
    return (
      <Page maxWidth="max-w-4xl">
        <CardSkeleton sections={2} />
      </Page>
    );
  }

  if (library.isError) {
    return (
      <Page maxWidth="max-w-4xl">
        <LoadError error={library.error} />
      </Page>
    );
  }
  if (!data) {
    return (
      <Page maxWidth="max-w-4xl">
        <CardSkeleton sections={2} />
      </Page>
    );
  }
  const scanning = !!data.scan;
  // Its folder rules go with it, and so do the playlists they made, so the warning counts them.
  const removes = `Its albums and tracks go from the server and from any playlists${
    data.ruleCount ? `, and so do its ${count(data.ruleCount, "folder rule")} and the playlists made from ${data.ruleCount === 1 ? "it" : "them"}` : ""
  }. The files on disk are not touched.`;

  return (
    <Page maxWidth="max-w-4xl" className="flex flex-col gap-6">
      <PageCrumb label={data.name} />

      <FormSection
        title="Scanning"
        description={`${count(data.albumCount, "album")}, ${number.format(data.trackCount)} ${data.trackCount === 1 ? "track" : "tracks"}. A scan picks up new, changed and removed files.`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ScanStatus library={data} running={data.scan} />
          <FormActions>
            <Button variant="secondary" size="sm" disabled={scanning || scan.isPending} onClick={() => scan.mutate({ id })}>
              Scan now
            </Button>
            {/* A normal scan skips files that haven't changed; this reads all of them again. */}
            <Button variant="outline" size="sm" disabled={scanning || scan.isPending} onClick={() => scan.mutate({ id, full: true })}>
              Rescan every file
            </Button>
          </FormActions>
        </div>
      </FormSection>

      {/* Keyed by what is saved, so the fields start from it again after each save. */}
      <Details key={`${data.name}\n${data.path}`} library={data} disabled={scanning} />

      <FormSection title="Who can reach it" description="Access lets someone browse and play. Download adds saving the original files. Admins reach every library.">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead >Person</TableHead>
              <TableHead className={`w-24 text-center`}>Access</TableHead>
              <TableHead className={`w-24 text-center`}>Download</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.access.map((row) => {
              const granted = row.isAdmin || row.granted;
              const canDownload = row.isAdmin || row.canDownload;
              const change = (next: { granted: boolean; canDownload: boolean }) => setAccess.mutate({ userId: row.userId, libraryId: id, ...next });
              return (
                <TableRow key={row.userId}>
                  <TableCell>
                    <Link href={`/admin/users/${row.userId}`} className="font-medium hover:underline">
                      {row.username}
                    </Link>
                    {row.isAdmin ? <span className="text-muted-foreground ml-2 text-xs">Admin</span> : null}
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      aria-label={`${row.username}: access`}
                      checked={granted}
                      disabled={row.isAdmin}
                      onCheckedChange={(checked) => change({ granted: checked === true, canDownload: checked === true && canDownload })}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      aria-label={`${row.username}: download`}
                      checked={granted && canDownload}
                      disabled={row.isAdmin || !granted}
                      onCheckedChange={(checked) => change({ granted: true, canDownload: checked === true })}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </FormSection>

      <FormSection
        title="Folder playlists"
        description="Rules that turn folders in this library into playlists and playlist folders."
        action={
          <Button variant="secondary" size="sm" asChild>
            <Link href={`/admin/libraries/${id}/rules/new`}>
              <Plus />
              Add rule
            </Link>
          </Button>
        }
      >
        {rules.data?.length ? (
          <ListRows>
            {rules.data.map((rule) => (
              <ListRow
                key={rule.id}
                icon={<FolderTree />}
                title={
                  <Link href={`/admin/libraries/${id}/rules/${rule.id}`} className="font-mono text-xs hover:underline">
                    {rule.path || "/"}
                  </Link>
                }
                detail={`${ruleModes[rule.mode].label} · ${count(rule.playlistCount, "playlist")}`}
              />
            ))}
          </ListRows>
        ) : rules.isError ? (
          <LoadError error={rules.error} />
        ) : (
          <p className="text-muted-foreground text-sm">{rules.isPending ? "Loading" : "None yet."}</p>
        )}
      </FormSection>

      <FormSection title="Remove" description={removes}>
        <Button
          variant="outline"
          disabled={scanning || remove.isPending}
          onClick={async () => {
            const ok = await confirm({
              title: `Remove ${data.name}?`,
              description: removes,
              confirmLabel: "Remove",
              variant: "destructive",
            });
            if (ok) remove.mutate({ id }, { onSuccess: () => toast(`Removed ${data.name}`) });
          }}
        >
          Remove library
        </Button>
      </FormSection>
    </Page>
  );
}

/** The library's name and the folder it reads. Pointing it at a new folder is for when the files have moved. */
function Details({ library, disabled }: { library: Library; disabled: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState(library.name);
  const [path, setPath] = useState(library.path);
  const [browsing, setBrowsing] = useState(false);
  const save = useMutation(
    trpc.admin.libraries.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.admin.pathFilter());
        toast(path.trim() === library.path ? "Saved" : "Saved. Scanning the new folder.");
      },
    }),
  );
  const moved = path.trim() !== library.path;
  const changed = moved || name.trim() !== library.name;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ id: library.id, name, path: moved ? path : undefined });
      }}
    >
      <FormSection title="Details" className="grid gap-4">
        <Field label="Name" htmlFor="library-name">
          <Input id="library-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
        </Field>
        <Field
          label="Folder"
          htmlFor="library-path"
          error={save.error?.message}
          hint="Change this only when the files have moved. Tracks keep their place in playlists, their likes and their play counts."
        >
          <div className="flex gap-2">
            <Input id="library-path" className="font-mono" autoCapitalize="none" spellCheck={false} value={path} onChange={(event) => setPath(event.target.value)} />
            <Button type="button" variant="outline" aria-expanded={browsing} onClick={() => setBrowsing(!browsing)}>
              Browse
            </Button>
          </div>
        </Field>
        {browsing ? <FolderBrowser value={path} onChange={setPath} /> : null}
        <FormActions>
          <Button type="submit" disabled={!name.trim() || !path.trim() || !changed || save.isPending || (moved && disabled)}>
            {moved ? "Save and scan" : "Save"}
          </Button>
          {changed ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setName(library.name);
                setPath(library.path);
              }}
            >
              Discard
            </Button>
          ) : null}
        </FormActions>
      </FormSection>
    </form>
  );
}
