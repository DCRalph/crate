"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  emptySourceState,
  isSourceReady,
  LibrarySourceFields,
  SourceTypePicker,
  toSourcePayload,
  type SourceFormState,
} from "~/components/admin/library-source-fields";
import { PageCrumb } from "~/components/shell/crumb";
import { Field, FormActions, FormSection } from "~/components/shell/form";
import { Page } from "~/components/shell/page";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useTRPC } from "~/trpc/react";

/** Adds a local folder, S3 bucket, SMB share, or NFS export as a library and starts scanning it. */
export function NewLibraryView() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [source, setSource] = useState<SourceFormState>(() => emptySourceState("local"));
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const test = useMutation(
    trpc.admin.libraries.testConnection.mutationOptions({
      onSuccess: (res) => setTestResult({ ok: true, message: res.detail }),
      onError: (error) => setTestResult({ ok: false, message: error.message }),
    }),
  );

  const create = useMutation(
    trpc.admin.libraries.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries(trpc.admin.libraries.pathFilter());
        toast(`Added ${name.trim()}. Scanning now.`);
        router.push(`/admin/libraries/${created.id}`);
      },
    }),
  );

  const updateSource = (next: SourceFormState) => {
    setSource(next);
    setTestResult(null);
  };

  const ready = isSourceReady(source);

  return (
    <Page maxWidth="max-w-2xl">
      <PageCrumb label="Add library" />
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({ name, source: toSourcePayload(source) });
        }}
      >
        <FormSection
          title="Add library"
          description="A library can come from a local folder, an S3-compatible bucket, or an SMB or NFS share. Nobody but admins can reach it until you give them access."
          className="grid gap-4"
        >
          <Field label="Name" htmlFor="library-name">
            <Input
              id="library-name"
              placeholder="Main"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              autoFocus
            />
          </Field>
          <div className="grid gap-2">
            <span className="text-sm leading-none font-medium">Source</span>
            <SourceTypePicker
              value={source.type}
              onChange={(type) => updateSource({ ...source, type })}
            />
          </div>
          <LibrarySourceFields
            state={source}
            onChange={updateSource}
            mode="create"
            error={create.error?.message ?? (testResult && !testResult.ok ? testResult.message : null)}
          />
          {testResult?.ok ? <p className="text-muted-foreground text-xs">{testResult.message}</p> : null}
        </FormSection>
        <FormActions>
          <Button type="submit" variant="brand" disabled={!name.trim() || !ready || create.isPending}>
            Add and scan
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!ready || test.isPending || create.isPending}
            onClick={() => test.mutate({ source: toSourcePayload(source) })}
          >
            {test.isPending ? "Testing..." : "Test connection"}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/libraries">Cancel</Link>
          </Button>
        </FormActions>
      </form>
    </Page>
  );
}
