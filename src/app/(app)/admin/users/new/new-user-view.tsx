"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageCrumb } from "~/components/shell/crumb";
import { Field, FormActions, FormSection } from "~/components/shell/form";
import { Page } from "~/components/shell/page";
import { LoadError } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { useTRPC } from "~/trpc/react";
import { LibraryAccessTable, PasswordField, QualitySelect, RoleSelect, type Role } from "../user-fields";

/** Makes an account: who they are, how they sign in, and what they can reach. Opens their page once it exists. */
export function NewUserView() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const libraries = useQuery(trpc.admin.libraries.options.queryOptions());
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [maxBitRate, setMaxBitRate] = useState<number | null>(null);
  /** The libraries ticked so far, each with whether downloads are allowed. */
  const [access, setAccess] = useState(new Map<number, boolean>());
  const create = useMutation(
    trpc.admin.users.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries(trpc.admin.pathFilter());
        toast(`Added ${username.trim().toLowerCase()}`);
        router.push(`/admin/users/${created.id}`);
      },
    }),
  );
  const isAdmin = role === "admin";

  return (
    <Page maxWidth="max-w-2xl">
      <PageCrumb label="New user" />
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({
            username,
            name: name.trim() || undefined,
            password,
            role,
            maxBitRate,
            access: Array.from(access, ([libraryId, canDownload]) => ({ libraryId, canDownload })),
          });
        }}
      >
        <FormSection title="Account" description="There is no sign-up. You make the account, then give them the username and password." className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Username" htmlFor="new-username" hint="What they sign in with. 2 to 30 letters, numbers, dots or underscores.">
              <Input
                id="new-username"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                maxLength={30}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Display name" htmlFor="new-name" hint="Optional. Shown in place of the username.">
              <Input id="new-name" autoComplete="off" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
          </div>
          <PasswordField
            id="new-password"
            label="Password"
            value={password}
            onChange={setPassword}
            hint="At least 12 characters. Copy it before you add the user: it is not shown again. They can change it after signing in."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role" htmlFor="new-role" hint="Admins manage users and libraries, and reach every library.">
              <RoleSelect id="new-role" className="w-full" value={role} onChange={setRole} />
            </Field>
            <Field label="Streaming quality" htmlFor="new-quality" hint="Anything above the limit is converted down before it is sent.">
              <QualitySelect id="new-quality" className="w-full" value={maxBitRate} onChange={setMaxBitRate} />
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Libraries"
          description={
            isAdmin ? "Admins reach every library and can download from all of them." : "Access lets them browse and play. Download adds saving the original files."
          }
        >
          {libraries.isError ? (
            <LoadError error={libraries.error} />
          ) : !libraries.data ? (
            <Skeleton className="h-24" />
          ) : libraries.data.length ? (
            <LibraryAccessTable
              rows={libraries.data.map((library) => ({
                libraryId: library.id,
                name: library.name,
                path: library.path,
                granted: access.has(library.id),
                canDownload: access.get(library.id) ?? false,
              }))}
              locked={isAdmin}
              onChange={(libraryId, next) => {
                const changed = new Map(access);
                if (next.granted) changed.set(libraryId, next.canDownload);
                else changed.delete(libraryId);
                setAccess(changed);
              }}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              No libraries yet. Add one under{" "}
              <Link href="/admin/libraries" className="text-foreground underline underline-offset-4">
                Libraries
              </Link>
              , then give them access from their page.
            </p>
          )}
        </FormSection>

        {create.error ? (
          <p role="alert" className="text-destructive text-sm">
            {create.error.message}
          </p>
        ) : null}
        <FormActions>
          <Button type="submit" variant="brand" disabled={!username.trim() || password.length < 12 || create.isPending}>
            Add user
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/users">Cancel</Link>
          </Button>
        </FormActions>
      </form>
    </Page>
  );
}
