"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useConfirm } from "~/components/confirm-provider";
import { LocalTime } from "~/components/local-time";
import { AppPasswordTable } from "~/components/shell/app-passwords";
import { PageCrumb } from "~/components/shell/crumb";
import { Field, FormActions, FormSection, SettingRow } from "~/components/shell/form";
import { Page } from "~/components/shell/page";
import { LoadError, SectionHeading } from "~/components/shell/states";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import { useTRPC } from "~/trpc/react";
import { LibraryAccessTable, PasswordField, QualitySelect, RoleSelect } from "../user-fields";

/** One thing about the account that is read here, not changed. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt >{label}</dt>
      <dd className="mt-1 text-sm break-words tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * Everything an admin can change about one person: their name, role and
 * limits, their password, which libraries they reach, their app passwords,
 * and removing them.
 */
export function UserView({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const user = useQuery(trpc.admin.users.byId.queryOptions({ id }));

  const refresh = () => queryClient.invalidateQueries(trpc.admin.pathFilter());
  const onError = (error: { message: string }) => toast.error(error.message);
  const update = useMutation(trpc.admin.users.update.mutationOptions({ onSuccess: refresh, onError }));
  const setAccess = useMutation(trpc.admin.users.setAccess.mutationOptions({ onSuccess: refresh, onError }));
  const revoke = useMutation(trpc.admin.users.revokeAppPassword.mutationOptions({ onSuccess: refresh, onError }));
  const remove = useMutation(
    trpc.admin.users.delete.mutationOptions({
      onSuccess: async () => {
        await refresh();
        router.push("/admin/users");
      },
      onError,
    }),
  );

  if (user.isError) {
    return (
      <Page maxWidth="max-w-4xl">
        <LoadError message={user.error.message} />
      </Page>
    );
  }
  const data = user.data;
  if (!data) {
    return (
      <Page maxWidth="max-w-4xl">
        <Skeleton className="h-64" />
      </Page>
    );
  }
  const name = data.username ?? data.name;
  const isAdmin = data.role === "admin";

  return (
    <Page maxWidth="max-w-4xl" className="flex flex-col gap-6">
      <PageCrumb label={name} />

      <FormSection title="Account" className="flex flex-col gap-5">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Fact label="Username">
            <span className="font-mono">{name}</span>
          </Fact>
          <Fact label="Created">
            <LocalTime date={data.createdAt} format="date" />
          </Fact>
          <Fact label="Last seen">
            <LocalTime date={data.lastSeenAt} format="relative" />
          </Fact>
        </dl>
        {/* Keyed by what is saved, so the field starts from it again after each save. */}
        <NameForm key={data.name} id={id} name={data.name} />
        <div>
          <SettingRow label="Role" detail="Admins manage users and libraries, and reach every library.">
            <RoleSelect size="sm" aria-label="Role" className="w-28" value={isAdmin ? "admin" : "user"} onChange={(role) => update.mutate({ id, role })} />
          </SettingRow>
          <SettingRow label="Streaming quality" detail="Anything above the limit is converted down before it is sent.">
            <QualitySelect
              size="sm"
              aria-label="Streaming quality"
              className="w-28"
              value={data.maxBitRate}
              onChange={(maxBitRate) => update.mutate({ id, maxBitRate })}
            />
          </SettingRow>
          <SettingRow label="Disabled" detail="Signs them out everywhere and stops their apps.">
            <Switch
              aria-label="Disabled"
              checked={data.banned}
              onCheckedChange={(banned) => update.mutate({ id, banned }, { onSuccess: () => toast(banned ? `Disabled ${name}` : `Enabled ${name}`) })}
            />
          </SettingRow>
        </div>
      </FormSection>

      <PasswordForm id={id} name={name} />

      <FormSection
        title="Libraries"
        description={
          isAdmin ? "Admins reach every library and can download from all of them." : "Access lets them browse and play. Download adds saving the original files."
        }
      >
        {data.access.length ? (
          <LibraryAccessTable rows={data.access} locked={isAdmin} onChange={(libraryId, next) => setAccess.mutate({ userId: id, libraryId, ...next })} />
        ) : (
          <p className="text-muted-foreground text-sm">No libraries yet. Add one under Libraries.</p>
        )}
      </FormSection>

      <section>
        <SectionHeading title="Music apps" detail={`App passwords ${name} has made. They add their own from Music apps.`} />
        <AppPasswordTable
          rows={data.appPasswords}
          onRevoke={(row) => revoke.mutate({ id: row.id }, { onSuccess: () => toast(`Revoked ${row.name}`) })}
          emptyMessage="None yet."
        />
      </section>

      <FormSection title="Delete user" description="Their account, playlists and app passwords go. Their plays stay in the logs.">
        <Button
          variant="outline"
          disabled={remove.isPending}
          onClick={async () => {
            const ok = await confirm({
              title: `Delete ${name}?`,
              description: "Their account, playlists and app passwords go. Their plays stay in the logs.",
              confirmLabel: "Delete",
              variant: "destructive",
            });
            if (ok) remove.mutate({ id }, { onSuccess: () => toast(`Deleted ${name}`) });
          }}
        >
          Delete {name}
        </Button>
      </FormSection>
    </Page>
  );
}

/** The name the app shows for them. It has its own Save; the settings under it apply as they are changed. */
function NameForm({ id, name }: { id: string; name: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(name);
  const save = useMutation(
    trpc.admin.users.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.admin.pathFilter());
        // The header shows the admin's own name, which this may have been.
        router.refresh();
        toast("Name saved");
      },
    }),
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ id, name: value });
      }}
    >
      <Field label="Display name" htmlFor="user-name" error={save.error?.message} hint="Shown in the app in place of their username.">
        <div className="flex gap-2">
          <Input id="user-name" autoComplete="off" maxLength={80} value={value} onChange={(event) => setValue(event.target.value)} />
          <Button type="submit" variant="secondary" disabled={!value.trim() || value.trim() === name || save.isPending}>
            Save
          </Button>
        </div>
      </Field>
    </form>
  );
}

/** Sets a new password for them. It stays on screen afterwards: this is the admin's one chance to pass it on. */
function PasswordForm({ id, name }: { id: string; name: string }) {
  const trpc = useTRPC();
  const [password, setPassword] = useState("");
  /** The password last set, so the page can say it is done and not offer to set the same one again. */
  const [saved, setSaved] = useState<string | null>(null);
  const set = useMutation(
    trpc.admin.users.setPassword.mutationOptions({
      onSuccess: (_, input) => {
        setSaved(input.password);
        toast(`Password set for ${name}`);
      },
    }),
  );
  const done = saved === password;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        set.mutate({ id, password });
      }}
    >
      <FormSection title="Password" description="Setting a new one signs them out of the website. Their music apps keep working." className="grid gap-4">
        <PasswordField
          id="user-password"
          label="New password"
          value={password}
          onChange={setPassword}
          error={set.error?.message}
          hint={done ? "Set. Copy it before you leave: it is not shown again." : "At least 12 characters. They can change it after signing in."}
        />
        <FormActions>
          <Button type="submit" disabled={password.length < 12 || done || set.isPending}>
            Set password
          </Button>
        </FormActions>
      </FormSection>
    </form>
  );
}
