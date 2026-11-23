"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Field } from "~/components/shell/form";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { describeAudience, type Audience, type AudienceTarget } from "~/lib/audience";
import { useTRPC } from "~/trpc/react";

type Choice = "follow" | Audience["kind"];

/** The line under the choice: what a folder or rule passes down. */
const holdsNote = {
  folder: "Everything inside follows this unless it sets its own.",
  rule: "What it makes follows this unless something there sets its own.",
} as const;

/**
 * Chooses who can listen: only the owner, everyone on this server, or chosen
 * people, plus "Same as" whatever the item follows when it is in a folder.
 * `value` is the item's own setting, null when it follows. `follows` names
 * what it follows and who that means now; null at the top level, where there
 * is nothing to follow. `ownerName` is for when the person choosing isn't the
 * owner. Used on its own by the pages that make something new, and through
 * `AudienceSetting` by the ones that change something saved.
 */
export function AudiencePicker({
  id,
  value,
  onChange,
  follows,
  ownerId,
  ownerName,
  holds,
  label = "Who can listen",
  disabled,
}: {
  id: string;
  value: Audience | null;
  onChange: (audience: Audience | null) => void;
  follows: { name: string; audience: Audience } | null;
  ownerId?: string;
  ownerName?: string;
  holds?: keyof typeof holdsNote;
  label?: string;
  disabled?: boolean;
}) {
  const trpc = useTRPC();
  const people = useQuery(trpc.playlists.people.queryOptions());
  const names = useMemo(() => new Map((people.data ?? []).map((person) => [person.id, person.name])), [people.data]);
  const choosable = (people.data ?? []).filter((person) => person.id !== ownerId);
  const choice: Choice = value ? value.kind : follows ? "follow" : "owner";
  const chosen = value?.kind === "people" ? value.userIds : [];

  const pick = (next: Choice) => {
    if (next === "follow") onChange(null);
    else if (next === "people") onChange({ kind: "people", userIds: chosen });
    else onChange({ kind: next });
  };
  const toggle = (personId: string, on: boolean) =>
    onChange({ kind: "people", userIds: on ? [...chosen, personId] : chosen.filter((other) => other !== personId) });

  return (
    <div className="grid gap-3">
      <Field label={label} htmlFor={id} hint={holds ? holdsNote[holds] : undefined}>
        <Select value={choice} onValueChange={(next) => pick(next as Choice)} disabled={disabled}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {follows ? (
              <SelectItem value="follow">
                Same as {follows.name} ({describeAudience(follows.audience, { ownerName, people: names })})
              </SelectItem>
            ) : null}
            <SelectItem value="owner">{ownerName ? `Only ${ownerName}` : "Only me"}</SelectItem>
            <SelectItem value="everyone">Everyone on this server</SelectItem>
            <SelectItem value="people">Chosen people</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {choice === "people" ? (
        people.isPending ? (
          <Skeleton className="h-24" />
        ) : choosable.length ? (
          <ul aria-label="Chosen people" className="grid max-h-56 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
            {choosable.map((person) => (
              <li key={person.id} className="flex items-center gap-2 px-1 py-1">
                <Checkbox
                  id={`${id}-${person.id}`}
                  checked={chosen.includes(person.id)}
                  disabled={disabled}
                  onCheckedChange={(checked) => toggle(person.id, checked === true)}
                />
                <Label htmlFor={`${id}-${person.id}`} className="min-w-0 truncate font-normal">
                  {person.name}
                </Label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">There is nobody else on this server yet.</p>
        )
      ) : null}
    </div>
  );
}

const nobodyYet: Audience = { kind: "people", userIds: [] };

/**
 * The "Who can listen" choice for something already saved: a playlist, a
 * folder, or a folder rule's default. Each change is saved as it is made.
 * Choosing "Chosen people" waits for the first person before saving, so
 * nobody is logged as shared with no one.
 */
export function AudienceSetting({ target, label, idPrefix = "audience" }: { target: AudienceTarget; label?: string; idPrefix?: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const settings = useQuery(trpc.playlists.audience.queryOptions({ target }));
  const [picking, setPicking] = useState(false);
  const save = useMutation(
    trpc.playlists.setAudience.mutationOptions({
      onSuccess: async () => {
        await Promise.all([queryClient.invalidateQueries(trpc.playlists.pathFilter()), queryClient.invalidateQueries(trpc.admin.folderRules.pathFilter())]);
        setPicking(false);
        toast("Saved");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  if (settings.isError) return <p className="text-destructive text-sm">{settings.error.message}</p>;
  if (!settings.data) return <Skeleton className="h-16" />;
  const { own, inherited, isMine, ownerId, ownerName } = settings.data;
  const follows = inherited.from
    ? { name: inherited.from.type === "folder" ? inherited.from.name : "its folder rule", audience: inherited.audience }
    : null;
  const shown = save.isPending ? save.variables.audience : picking ? nobodyYet : own;

  return (
    <AudiencePicker
      id={`${idPrefix}-${target.type}-${target.id}`}
      label={label}
      value={shown}
      follows={follows}
      ownerId={ownerId}
      ownerName={isMine ? undefined : ownerName}
      holds={target.type === "playlist" ? undefined : target.type}
      disabled={save.isPending}
      onChange={(audience) => {
        // An empty list of people is only a step on the way, unless it is what was saved.
        if (audience?.kind === "people" && !audience.userIds.length && own?.kind !== "people") {
          setPicking(true);
          return;
        }
        setPicking(false);
        save.mutate({ target, audience });
      }}
    />
  );
}
