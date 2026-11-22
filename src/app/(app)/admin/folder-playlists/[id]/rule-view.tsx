"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ModePicker, playlistFileNote, RulePreview } from "~/components/admin/folder-rule-parts";
import { useConfirm } from "~/components/confirm-provider";
import { FolderSelect } from "~/components/playlists/folder-select";
import { PageCrumb } from "~/components/shell/crumb";
import { Field, FormActions, FormSection, SettingRow } from "~/components/shell/form";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import { count } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

/** One folder rule: what it follows, what it makes, and the result as it stands. Changes rebuild it straight away. */
export function RuleView({ id }: { id: number }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const rule = useQuery(trpc.admin.folderRules.byId.queryOptions({ id }));
  const refresh = () => Promise.all([queryClient.invalidateQueries(trpc.admin.pathFilter()), queryClient.invalidateQueries(trpc.playlists.pathFilter())]);
  const onError = (error: { message: string }) => toast.error(error.message);
  const update = useMutation(trpc.admin.folderRules.update.mutationOptions({ onSuccess: refresh, onError }));
  const sync = useMutation(trpc.admin.folderRules.sync.mutationOptions({ onSuccess: refresh, onError }));
  const remove = useMutation(
    trpc.admin.folderRules.delete.mutationOptions({
      onSuccess: async () => {
        await refresh();
        router.push("/admin/folder-playlists");
      },
      onError,
    }),
  );

  if (rule.isError) {
    return (
      <Page maxWidth="max-w-4xl">
        <LoadError message={rule.error.message} />
      </Page>
    );
  }
  const data = rule.data;
  if (!data) {
    return (
      <Page maxWidth="max-w-4xl">
        <Skeleton className="h-64" />
      </Page>
    );
  }
  // The folder as people name it: the library, then the path inside it when the rule isn't on the whole library.
  const where = data.path ? `${data.libraryName}/${data.path}` : data.libraryName;

  return (
    <Page maxWidth="max-w-4xl" className="flex flex-col gap-6">
      <PageCrumb label={where} />

      <FormSection
        title="Folder it follows"
        description={
          <>
            <code className="font-mono text-xs">{data.path ? `${data.libraryPath}/${data.path}` : data.libraryPath}</code>{" "}
            in{" "}
            <Link href={`/admin/libraries/${data.libraryId}`} className="hover:text-foreground underline underline-offset-4">
              {data.libraryName}
            </Link>
            . Added by {data.ownerName}. To follow a different folder, add another rule.
          </>
        }
        action={
          <Button variant="secondary" size="sm" disabled={sync.isPending} onClick={() => sync.mutate({ id }, { onSuccess: () => toast("Rebuilt from what is scanned now") })}>
            Rebuild now
          </Button>
        }
      >
        <p className="text-muted-foreground text-sm tabular-nums">
          Makes {[data.folderCount ? count(data.folderCount, "folder") : null, count(data.playlistCount, "playlist")].filter(Boolean).join(" and ")}. Rebuilt after every scan of the
          library.
        </p>
      </FormSection>

      <FormSection title="What it makes" className="grid gap-4">
        <ModePicker value={data.mode} disabled={update.isPending} onChange={(mode) => mode !== data.mode && update.mutate({ id, mode }, { onSuccess: () => toast("Rebuilt") })} />
        <Field label="Put it in" htmlFor="rule-parent" hint={`One of ${data.ownerName}'s own playlist folders, or the top level.`}>
          <FolderSelect id="rule-parent" value={data.parentFolderId} onChange={(parentFolderId) => update.mutate({ id, parentFolderId }, { onSuccess: () => toast("Moved") })} />
        </Field>
        <SettingRow label="Everyone can see it" detail="People still only see playlists with tracks from libraries they can reach.">
          <Switch aria-label="Everyone can see it" checked={data.isPublic} onCheckedChange={(isPublic) => update.mutate({ id, isPublic })} />
        </SettingRow>
      </FormSection>

      <FormSection
        title="Result"
        description={<>These follow the files, so nobody edits them by hand. Anyone can make their own copy of a playlist to change. {playlistFileNote[data.mode]}</>}
      >
        <RulePreview libraryId={data.libraryId} path={data.path} mode={data.mode} />
      </FormSection>

      <FormSection title="Remove" description="The rule goes, along with the folders and playlists it made. Copies people made are theirs and stay.">
        <FormActions>
          <Button
            variant="outline"
            onClick={async () => {
              const ok = await confirm({
                title: "Remove this rule?",
                description: `The folders and playlists made from ${where} go with it.`,
                confirmLabel: "Remove",
                variant: "destructive",
              });
              if (ok) remove.mutate({ id }, { onSuccess: () => toast("Rule removed") });
            }}
          >
            Remove rule
          </Button>
        </FormActions>
      </FormSection>
    </Page>
  );
}
