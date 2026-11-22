"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { LibraryFolderPicker, ModePicker, RulePreview } from "~/components/admin/folder-rule-parts";
import { FolderSelect } from "~/components/playlists/folder-select";
import { PageCrumb } from "~/components/shell/crumb";
import { Field, FormActions, FormSection, SettingRow } from "~/components/shell/form";
import { Page } from "~/components/shell/page";
import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { useTRPC, type RouterOutputs } from "~/trpc/react";

type Mode = RouterOutputs["admin"]["folderRules"]["list"][number]["mode"];

/** Sets up a folder rule: which folder to follow, what to make of it, who sees it, and a preview of the result before saving. */
export function NewRuleView({ libraryId: startLibrary }: { libraryId: number | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const libraries = useQuery(trpc.admin.libraries.options.queryOptions());
  const [picked, setPicked] = useState(startLibrary);
  // With one library there is nothing to choose.
  const libraryId = picked ?? (libraries.data?.length === 1 ? libraries.data[0]!.id : null);
  const [path, setPath] = useState("");
  const [mode, setMode] = useState<Mode>("tree");
  const [isPublic, setIsPublic] = useState(true);
  const [parentFolderId, setParentFolderId] = useState<number | null>(null);
  const create = useMutation(
    trpc.admin.folderRules.create.mutationOptions({
      onSuccess: async (created) => {
        await Promise.all([queryClient.invalidateQueries(trpc.admin.pathFilter()), queryClient.invalidateQueries(trpc.playlists.pathFilter())]);
        toast("Rule added. Its playlists are ready.");
        router.push(`/admin/folder-playlists/${created.id}`);
      },
    }),
  );

  return (
    <Page maxWidth="max-w-4xl">
      <PageCrumb label="Add rule" />
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (libraryId !== null) create.mutate({ libraryId, path, mode, isPublic, parentFolderId });
        }}
      >
        <FormSection title="Folder to follow" description="Pick a library, then the folder inside it." className="grid gap-4">
          <Field label="Library" htmlFor="rule-library">
            <Select
              value={libraryId === null ? "" : String(libraryId)}
              onValueChange={(value) => {
                setPicked(Number(value));
                setPath("");
              }}
            >
              <SelectTrigger id="rule-library" className="w-full">
                <SelectValue placeholder="Choose a library" />
              </SelectTrigger>
              <SelectContent>
                {libraries.data?.map((library) => (
                  <SelectItem key={library.id} value={String(library.id)}>
                    {library.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {libraryId !== null ? <LibraryFolderPicker libraryId={libraryId} value={path} onChange={setPath} /> : null}
        </FormSection>

        <FormSection title="What it makes" className="grid gap-4">
          <ModePicker value={mode} onChange={setMode} />
          <Field label="Put it in" htmlFor="rule-parent" hint="One of your own playlist folders, or the top level.">
            <FolderSelect id="rule-parent" value={parentFolderId} onChange={setParentFolderId} />
          </Field>
          <SettingRow label="Everyone can see it" detail="People still only see playlists with tracks from libraries they can reach.">
            <Switch aria-label="Everyone can see it" checked={isPublic} onCheckedChange={setIsPublic} />
          </SettingRow>
        </FormSection>

        {libraryId !== null ? (
          <FormSection title="Preview" description="What this rule would make from what is scanned now. It follows the files from then on, and nobody edits the result by hand.">
            <RulePreview libraryId={libraryId} path={path} mode={mode} />
          </FormSection>
        ) : null}

        {create.error ? <p className="text-destructive text-sm">{create.error.message}</p> : null}
        <FormActions>
          <Button type="submit" variant="brand" disabled={libraryId === null || create.isPending}>
            Add rule
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/folder-playlists">Cancel</Link>
          </Button>
        </FormActions>
      </form>
    </Page>
  );
}
