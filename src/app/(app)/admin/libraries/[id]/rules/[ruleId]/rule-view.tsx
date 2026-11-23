"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ModePicker, playlistFileNote, RulePreview, ruleModes } from "~/components/admin/folder-rule-parts";
import { RuleAudiences } from "~/components/admin/rule-audiences";
import { useConfirm } from "~/components/confirm-provider";
import { AudienceSetting } from "~/components/playlists/audience-picker";
import { FolderSelect } from "~/components/playlists/folder-select";
import { PageCrumb } from "~/components/shell/crumb";
import { Field, FormActions, FormSection } from "~/components/shell/form";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { count } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { CardSkeleton } from "~/components/shell/skeletons";

/**
 * One folder rule: what it follows, what it makes, and the result as it
 * stands. Changes rebuild it straight away. It lives under its library, which
 * is where removing it leads back to.
 */
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
      // Not awaited: the page shows a placeholder from here until it has left (see below).
      onSuccess: () => {
        void refresh();
        router.push(rule.data ? `/admin/libraries/${rule.data.libraryId}` : "/admin/libraries");
      },
      onError,
    }),
  );

  // Removed and on the way out. Asking for the rule again would only say it isn't there.
  if (remove.isSuccess) {
    return (
      <Page maxWidth="max-w-4xl">
        <CardSkeleton sections={2} />
      </Page>
    );
  }

  if (rule.isError) {
    return (
      <Page maxWidth="max-w-4xl">
        <LoadError error={rule.error} />
      </Page>
    );
  }
  const data = rule.data;
  if (!data) {
    return (
      <Page maxWidth="max-w-4xl">
        <CardSkeleton sections={2} />
      </Page>
    );
  }
  // The folder as people name it: the library, then the path inside it when the rule isn't on the whole library.
  const where = data.path ? `${data.libraryName}/${data.path}` : data.libraryName;
  /** Changing what a rule makes throws away what it made, pins on those playlists included, so it is asked about first. */
  const changeMode = async (mode: typeof data.mode) => {
    if (mode === data.mode) return;
    const made = [data.folderCount ? count(data.folderCount, "folder") : null, count(data.playlistCount, "playlist")].filter(Boolean).join(" and ");
    const ok = await confirm({
      title: `Change to "${ruleModes[mode].label}"?`,
      description: `The ${made} this rule made ${data.folderCount + data.playlistCount === 1 ? "is" : "are"} removed and built again in the new shape. Pins on them are lost.`,
      confirmLabel: "Change",
    });
    if (ok) update.mutate({ id, mode }, { onSuccess: () => toast("Rebuilt") });
  };

  return (
    <Page maxWidth="max-w-4xl" className="flex flex-col gap-6">
      <PageCrumb label={`Folder rule: ${where}`} />

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
        <ModePicker value={data.mode} disabled={update.isPending} onChange={changeMode} />
        {/* The folders offered are the viewer's own, and only the rule's owner's can hold what it makes. */}
        {data.isMine ? (
          <Field label="Put it in" htmlFor="rule-parent" hint="One of your own playlist folders, or the top level.">
            <FolderSelect id="rule-parent" value={data.parentFolderId} onChange={(parentFolderId) => update.mutate({ id, parentFolderId }, { onSuccess: () => toast("Moved") })} />
          </Field>
        ) : (
          <p className="text-muted-foreground text-sm">{data.ownerName} made this rule, and what it makes sits among their playlists. Only they can move it.</p>
        )}
        <AudienceSetting target={{ type: "rule", id }} />
      </FormSection>

      <FormSection
        title="Result"
        description={<>These follow the files, so nobody edits them by hand. Anyone can make their own copy of a playlist to change. {playlistFileNote[data.mode]}</>}
      >
        <RulePreview libraryId={data.libraryId} path={data.path} mode={data.mode} />
      </FormSection>

      <FormSection title="Sharing" description="Each folder and playlist follows the one above it unless it sets its own. Settings stay through rescans.">
        <RuleAudiences ruleId={id} ownerName={data.isMine ? undefined : data.ownerName} />
      </FormSection>

      <FormSection title="Remove" description="The rule goes, along with the folders and playlists it made. Copies people made are theirs and stay.">
        <FormActions>
          <Button
            variant="outline"
            disabled={remove.isPending}
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
