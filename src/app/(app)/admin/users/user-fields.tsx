"use client";

import type { ComponentProps } from "react";

import { CopyButton } from "~/components/shell/copy-button";
import { Field } from "~/components/shell/form";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import type { RouterOutputs } from "~/trpc/react";

// The controls the new-user page and a user's own page share, so an account
// is set up and changed with the same parts.

/** What a page passes through to a select's button: its id or label, and how it sits. */
type TriggerProps = Pick<ComponentProps<typeof SelectTrigger>, "id" | "size" | "className" | "aria-label">;

const roles = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
] as const;

export type Role = (typeof roles)[number]["value"];

export function RoleSelect({ value, onChange, ...trigger }: { value: Role; onChange: (role: Role) => void } & TriggerProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const role = roles.find((option) => option.value === next);
        if (role) onChange(role.value);
      }}
    >
      <SelectTrigger {...trigger}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {roles.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const bitRates = [320, 256, 192, 128, 96];

/** The streaming limit in kbps. Null is no limit: files are sent as they are. */
export function QualitySelect({ value, onChange, ...trigger }: { value: number | null; onChange: (maxBitRate: number | null) => void } & TriggerProps) {
  return (
    <Select value={String(value ?? "none")} onValueChange={(next) => onChange(next === "none" ? null : Number(next))}>
      <SelectTrigger {...trigger}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="none">Original</SelectItem>
        {bitRates.map((rate) => (
          <SelectItem key={rate} value={String(rate)}>
            {rate} kbps
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// No l, o, 0 or 1: an admin may have to read this out, or someone type it on a phone.
const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";

/** A random password: 20 characters out of 32, so 100 bits, in groups of four. */
export function generatePassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  // 256 is a multiple of 32, so every character is as likely as any other.
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length])
    .join("")
    .replace(/.{4}(?=.)/g, "$&-");
}

/** A password an admin sets for someone, typed or generated. Shown in the clear, in monospace, so it can be copied out. */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (password: string) => void;
  hint?: string;
  error?: string | null;
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="font-mono"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {value ? <CopyButton value={value} label="Copy password" /> : null}
        <Button type="button" variant="outline" onClick={() => onChange(generatePassword())}>
          Generate
        </Button>
      </div>
    </Field>
  );
}

type AccessRow = RouterOutputs["admin"]["users"]["byId"]["access"][number];
const head = "t-label text-muted-foreground text-[10px]";

/**
 * Every library with a box for access and one for downloads. Download only
 * means something with access, so it follows it. `locked` is for admins, who
 * reach everything.
 */
export function LibraryAccessTable({
  rows,
  locked,
  onChange,
}: {
  rows: AccessRow[];
  locked: boolean;
  onChange: (libraryId: number, next: { granted: boolean; canDownload: boolean }) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={head}>Library</TableHead>
          <TableHead className={`${head} max-sm:hidden`}>Folder</TableHead>
          <TableHead className={`${head} w-24 text-center`}>Access</TableHead>
          <TableHead className={`${head} w-24 text-center`}>Download</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const granted = locked || row.granted;
          const canDownload = locked || row.canDownload;
          return (
            <TableRow key={row.libraryId}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell className="text-muted-foreground font-mono text-xs max-sm:hidden">{row.path}</TableCell>
              <TableCell className="text-center">
                <Checkbox
                  aria-label={`${row.name}: access`}
                  checked={granted}
                  disabled={locked}
                  onCheckedChange={(checked) => onChange(row.libraryId, { granted: checked === true, canDownload: checked === true && canDownload })}
                />
              </TableCell>
              <TableCell className="text-center">
                <Checkbox
                  aria-label={`${row.name}: download`}
                  checked={granted && canDownload}
                  disabled={locked || !granted}
                  onCheckedChange={(checked) => onChange(row.libraryId, { granted: true, canDownload: checked === true })}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
