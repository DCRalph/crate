"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderTree, Plus } from "lucide-react";
import { toast } from "sonner";

import { ruleModes } from "~/components/admin/folder-rule-parts";
import {
  isSourceReady,
  LibrarySourceFields,
  SourceBadge,
  stateFromLibrary,
  toSourcePayload,
  type SourceFormState,
} from "~/components/admin/library-source-fields";
import { ScanStatus, useScanAnnouncements } from "~/components/admin/scan";
import { useConfirm } from "~/components/confirm-provider";
import { PageCrumb } from "~/components/shell/crumb";
import { Field, FormActions, FormSection } from "~/components/shell/form";
import { ListRow, ListRows } from "~/components/shell/list-row";
import { Page } from "~/components/shell/page";
import { CardSkeleton } from "~/components/shell/skeletons";
import { LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { count } from "~/lib/format";
import { useTRPC, type RouterOutputs } from "~/trpc/react";

type Library = RouterOutputs["admin"]["libraries"]["byId"];
const number = new Intl.NumberFormat("en");

const untouchedFilesCopy = {
  local: "The files on disk are not touched.",
  s3: "The files in the bucket are not touched.",
  smb: "The files on the share are not touched.",
  nfs: "The files on the share are not touched.",
} as const;

/** One library: its name and source, its scans, who can reach it, the folder rules on it, and removing it. */
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
  const reconnect = useMutation(
    trpc.admin.libraries.reconnect.mutationOptions({
      onSuccess: (res) => toast(res.detail ?? "Reconnected to share."),
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
  const isNetworkMount = data.sourceType === "smb" || data.sourceType === "nfs";
  // Its folder rules go with it, and so do the playlists they made, so the warning counts them.
  const removes = `Its albums and tracks go from the server and from any playlists${
    data.ruleCount ? `, and so do its ${count(data.ruleCount, "folder rule")} and the playlists made from ${data.ruleCount === 1 ? "it" : "them"}` : ""
  }. ${untouchedFilesCopy[data.sourceType]}`;

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
            {isNetworkMount ? (
              <Button variant="outline" size="sm" disabled={scanning || reconnect.isPending} onClick={() => reconnect.mutate({ id })}>
                {reconnect.isPending ? "Reconnecting..." : "Reconnect share"}
              </Button>
            ) : null}
          </FormActions>
        </div>
      </FormSection>

      {/* Keyed by what is saved, so the fields start from it again after each save. */}
      <Details key={`${data.name}\n${data.path}\n${JSON.stringify(data.source)}`} library={data} disabled={scanning} />

      <FormSection title="Who can reach it" description="Access lets someone browse and play. Download adds saving the original files. Admins reach every library.">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Person</TableHead>
              <TableHead className="w-24 text-center">Access</TableHead>
              <TableHead className="w-24 text-center">Download</TableHead>
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

/** The library's name and source settings. Changing the location is for when the files have moved. */
function Details({ library, disabled }: { library: Library; disabled: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const initialSource = stateFromLibrary(library);
  const [name, setName] = useState(library.name);
  const [source, setSource] = useState<SourceFormState>(() => initialSource);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const test = useMutation(
    trpc.admin.libraries.testConnection.mutationOptions({
      onSuccess: (res) => setTestResult({ ok: true, message: res.detail }),
      onError: (error) => setTestResult({ ok: false, message: error.message }),
    }),
  );

  const save = useMutation(
    trpc.admin.libraries.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.admin.pathFilter());
        toast("Saved");
      },
    }),
  );

  const sourceChanged = JSON.stringify(source) !== JSON.stringify(initialSource);
  const changed = sourceChanged || name.trim() !== library.name;
  const ready = isSourceReady(source);

  const updateSource = (next: SourceFormState) => {
    setSource(next);
    setTestResult(null);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ id: library.id, name, source: sourceChanged ? toSourcePayload(source) : undefined });
      }}
    >
      <FormSection
        title="Details"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <SourceBadge type={library.sourceType} />
            <span className="font-mono text-xs">{library.path}</span>
          </span>
        }
        className="grid gap-4"
      >
        <Field label="Name" htmlFor="library-name">
          <Input id="library-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
        </Field>
        <LibrarySourceFields
          state={source}
          onChange={updateSource}
          mode="edit"
          error={save.error?.message ?? (testResult && !testResult.ok ? testResult.message : null)}
        />
        {testResult?.ok ? <p className="text-muted-foreground text-xs">{testResult.message}</p> : null}
        <FormActions>
          <Button type="submit" disabled={!name.trim() || !ready || !changed || save.isPending || (sourceChanged && disabled)}>
            Save
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!ready || test.isPending || save.isPending}
            onClick={() => test.mutate({ source: toSourcePayload(source), libraryId: library.id })}
          >
            {test.isPending ? "Testing..." : "Test connection"}
          </Button>
          {changed ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setName(library.name);
                setSource(initialSource);
                setTestResult(null);
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
