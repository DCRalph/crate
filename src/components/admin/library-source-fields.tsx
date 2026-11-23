"use client";

import { useState } from "react";
import { Cloud, Folder, HardDrive, Network } from "lucide-react";

import { FolderBrowser } from "~/components/admin/folder-browser";
import { Field, SettingRow } from "~/components/shell/form";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import {
  librarySourceMeta,
  librarySourceTypes,
  type LibrarySourceType,
  type NfsVersion,
  type PublicSourceConfig,
} from "~/lib/library-source";
import { cn } from "~/lib/utils";

const sourceIcons: Record<LibrarySourceType, typeof Folder> = {
  local: Folder,
  s3: Cloud,
  smb: Network,
  nfs: HardDrive,
};

export function SourceBadge({ type }: { type: LibrarySourceType }) {
  return <Badge variant="secondary">{librarySourceMeta[type].shortLabel}</Badge>;
}

/** Picks which kind of storage backs a new library. */
export function SourceTypePicker({
  value,
  onChange,
  disabled,
}: {
  value: LibrarySourceType;
  onChange: (type: LibrarySourceType) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Source type" className="grid gap-2 sm:grid-cols-2">
      {librarySourceTypes.map((type) => {
        const Icon = sourceIcons[type];
        const selected = value === type;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(type)}
            className={cn(
              "focus-visible:ring-ring/50 rounded-md border p-3 text-left outline-none transition-colors focus-visible:ring-[3px] disabled:opacity-50",
              selected ? "border-foreground bg-accent/50" : "hover:bg-accent/30",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Icon className="text-muted-foreground size-4 shrink-0" />
              {librarySourceMeta[type].label}
            </span>
            <span className="text-muted-foreground mt-1 block text-xs">{librarySourceMeta[type].description}</span>
          </button>
        );
      })}
    </div>
  );
}

export type SourceFormState = {
  type: LibrarySourceType;
  // Local
  localPath: string;
  // S3
  s3Bucket: string;
  s3Region: string;
  s3Endpoint: string;
  s3Prefix: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3HasSecret: boolean;
  s3ClearCredentials: boolean;
  s3ForcePathStyle: boolean;
  // SMB
  smbHost: string;
  smbShare: string;
  smbSubpath: string;
  smbPort: string;
  smbUsername: string;
  smbPassword: string;
  smbHasPassword: boolean;
  smbClearPassword: boolean;
  smbDomain: string;
  // NFS
  nfsHost: string;
  nfsExportPath: string;
  nfsSubpath: string;
  nfsVersion: NfsVersion;
  nfsOptions: string;
};

export function emptySourceState(type: LibrarySourceType = "local"): SourceFormState {
  return {
    type,
    localPath: "",
    s3Bucket: "",
    s3Region: "us-east-1",
    s3Endpoint: "",
    s3Prefix: "",
    s3AccessKeyId: "",
    s3SecretAccessKey: "",
    s3HasSecret: false,
    s3ClearCredentials: false,
    s3ForcePathStyle: false,
    smbHost: "",
    smbShare: "",
    smbSubpath: "",
    smbPort: "",
    smbUsername: "",
    smbPassword: "",
    smbHasPassword: false,
    smbClearPassword: false,
    smbDomain: "",
    nfsHost: "",
    nfsExportPath: "",
    nfsSubpath: "",
    nfsVersion: "auto",
    nfsOptions: "",
  };
}

export function stateFromLibrary(library: { path: string; source: PublicSourceConfig }): SourceFormState {
  const base = emptySourceState(library.source.type);
  if (library.source.type === "local") {
    return { ...base, localPath: library.path };
  }
  if (library.source.type === "s3") {
    const s3 = library.source.s3;
    return {
      ...base,
      s3Bucket: s3.bucket,
      s3Region: s3.region,
      s3Endpoint: s3.endpoint ?? "",
      s3Prefix: s3.prefix,
      s3AccessKeyId: s3.accessKeyId ?? "",
      s3HasSecret: s3.hasSecretAccessKey,
      s3ForcePathStyle: s3.forcePathStyle,
    };
  }
  if (library.source.type === "smb") {
    const smb = library.source.smb;
    return {
      ...base,
      smbHost: smb.host,
      smbShare: smb.share,
      smbSubpath: smb.subpath,
      smbPort: smb.port ? String(smb.port) : "",
      smbUsername: smb.username ?? "",
      smbHasPassword: smb.hasPassword,
      smbDomain: smb.domain ?? "",
    };
  }
  const nfs = library.source.nfs;
  return {
    ...base,
    nfsHost: nfs.host,
    nfsExportPath: nfs.exportPath,
    nfsSubpath: nfs.subpath,
    nfsVersion: nfs.version,
    nfsOptions: nfs.options ?? "",
  };
}

export function isSourceReady(state: SourceFormState): boolean {
  if (state.type === "local") return Boolean(state.localPath.trim());
  if (state.type === "s3") return Boolean(state.s3Bucket.trim() && state.s3Region.trim());
  if (state.type === "smb") return Boolean(state.smbHost.trim() && state.smbShare.trim());
  return Boolean(state.nfsHost.trim() && state.nfsExportPath.trim());
}

export function toSourcePayload(state: SourceFormState) {
  if (state.type === "local") {
    return { type: "local" as const, path: state.localPath.trim() };
  }
  if (state.type === "s3") {
    return {
      type: "s3" as const,
      bucket: state.s3Bucket.trim(),
      region: state.s3Region.trim() || "us-east-1",
      endpoint: state.s3Endpoint.trim() || undefined,
      prefix: state.s3Prefix.trim() || undefined,
      accessKeyId: state.s3ClearCredentials ? undefined : state.s3AccessKeyId.trim() || undefined,
      secretAccessKey: state.s3ClearCredentials ? undefined : state.s3SecretAccessKey || undefined,
      clearCredentials: state.s3ClearCredentials || undefined,
      forcePathStyle: state.s3ForcePathStyle,
    };
  }
  if (state.type === "smb") {
    const parsedPort = state.smbPort.trim() ? Number(state.smbPort.trim()) : null;
    return {
      type: "smb" as const,
      host: state.smbHost.trim(),
      share: state.smbShare.trim(),
      subpath: state.smbSubpath.trim() || undefined,
      port: parsedPort && Number.isInteger(parsedPort) ? parsedPort : null,
      username: state.smbUsername.trim() || undefined,
      password: state.smbClearPassword ? undefined : state.smbPassword || undefined,
      clearPassword: state.smbClearPassword || undefined,
      domain: state.smbDomain.trim() || undefined,
    };
  }
  return {
    type: "nfs" as const,
    host: state.nfsHost.trim(),
    exportPath: state.nfsExportPath.trim(),
    subpath: state.nfsSubpath.trim() || undefined,
    version: state.nfsVersion,
    options: state.nfsOptions.trim() || undefined,
  };
}

/** Source-specific fields for adding or editing a library. */
export function LibrarySourceFields({
  state,
  onChange,
  mode,
  error,
}: {
  state: SourceFormState;
  onChange: (next: SourceFormState) => void;
  mode: "create" | "edit";
  error?: string | null;
}) {
  const [browsing, setBrowsing] = useState(mode === "create");
  const patch = (partial: Partial<SourceFormState>) => onChange({ ...state, ...partial });

  if (state.type === "local") {
    return (
      <>
        <Field
          label="Folder"
          htmlFor="library-path"
          error={error}
          hint={
            mode === "create"
              ? "Type the full path, or open folders below to pick one."
              : "Change this only when the files have moved. Tracks keep their place in playlists, their likes and their play counts."
          }
        >
          <div className="flex gap-2">
            <Input
              id="library-path"
              placeholder="/music/library"
              className="font-mono"
              autoCapitalize="none"
              spellCheck={false}
              value={state.localPath}
              onChange={(event) => patch({ localPath: event.target.value })}
            />
            {mode === "edit" ? (
              <Button type="button" variant="outline" aria-expanded={browsing} onClick={() => setBrowsing(!browsing)}>
                Browse
              </Button>
            ) : null}
          </div>
        </Field>
        {browsing ? <FolderBrowser value={state.localPath} onChange={(localPath) => patch({ localPath })} /> : null}
      </>
    );
  }

  if (state.type === "s3") {
    return (
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bucket" htmlFor="s3-bucket">
            <Input
              id="s3-bucket"
              placeholder="my-music-bucket"
              className="font-mono"
              autoCapitalize="none"
              spellCheck={false}
              value={state.s3Bucket}
              onChange={(event) => patch({ s3Bucket: event.target.value })}
            />
          </Field>
          <Field label="Region" htmlFor="s3-region" hint="Use `auto` for Cloudflare R2, or `us-east-1` for MinIO.">
            <Input
              id="s3-region"
              placeholder="us-east-1"
              className="font-mono"
              autoCapitalize="none"
              spellCheck={false}
              value={state.s3Region}
              onChange={(event) => patch({ s3Region: event.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Endpoint URL" htmlFor="s3-endpoint" hint="Optional. Leave blank for AWS S3; set for R2, MinIO, B2, or Spaces.">
            <Input
              id="s3-endpoint"
              placeholder="https://s3.example.com"
              className="font-mono"
              autoCapitalize="none"
              spellCheck={false}
              value={state.s3Endpoint}
              onChange={(event) => {
                const s3Endpoint = event.target.value;
                // Default path-style on automatically when a custom endpoint is entered for the first time.
                patch({
                  s3Endpoint,
                  s3ForcePathStyle: !state.s3Endpoint && Boolean(s3Endpoint.trim()) ? true : state.s3ForcePathStyle,
                });
              }}
            />
          </Field>
          <Field label="Prefix" htmlFor="s3-prefix" hint="Optional subfolder inside the bucket (e.g. music/flac).">
            <Input
              id="s3-prefix"
              placeholder="music"
              className="font-mono"
              autoCapitalize="none"
              spellCheck={false}
              value={state.s3Prefix}
              onChange={(event) => patch({ s3Prefix: event.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Access key ID" htmlFor="s3-access-key" hint="Optional. Leave both keys blank to use the server's IAM role or AWS env vars.">
            <Input
              id="s3-access-key"
              className="font-mono"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              disabled={state.s3ClearCredentials}
              value={state.s3AccessKeyId}
              onChange={(event) => patch({ s3AccessKeyId: event.target.value })}
            />
          </Field>
          <Field label="Secret access key" htmlFor="s3-secret-key" hint="Stored encrypted on the server.">
            <Input
              id="s3-secret-key"
              type="password"
              className="font-mono"
              autoComplete="new-password"
              disabled={state.s3ClearCredentials}
              placeholder={state.s3HasSecret ? "Saved — leave blank to keep" : ""}
              value={state.s3SecretAccessKey}
              onChange={(event) => patch({ s3SecretAccessKey: event.target.value })}
            />
          </Field>
        </div>

        {mode === "edit" && (state.s3HasSecret || state.s3AccessKeyId) ? (
          <div className="flex items-center gap-2">
            <Checkbox
              id="s3-clear-creds"
              checked={state.s3ClearCredentials}
              onCheckedChange={(checked) => patch({ s3ClearCredentials: checked === true })}
            />
            <Label htmlFor="s3-clear-creds" className="text-muted-foreground text-xs font-normal">
              Clear saved keys and use the server&apos;s default AWS credentials
            </Label>
          </div>
        ) : null}

        <SettingRow
          label="Path-style addressing"
          detail="Use endpoint/bucket instead of bucket.endpoint. Usually needed for MinIO and self-hosted S3 servers."
        >
          <Switch
            aria-label="Path-style addressing"
            checked={state.s3ForcePathStyle}
            onCheckedChange={(checked) => patch({ s3ForcePathStyle: checked })}
          />
        </SettingRow>

        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
    );
  }

  if (state.type === "smb") {
    return (
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Host" htmlFor="smb-host" className="sm:col-span-2">
            <Input
              id="smb-host"
              placeholder="nas.local or 192.168.1.50"
              className="font-mono"
              autoCapitalize="none"
              spellCheck={false}
              value={state.smbHost}
              onChange={(event) => patch({ smbHost: event.target.value })}
            />
          </Field>
          <Field label="Port" htmlFor="smb-port" hint="Default 445.">
            <Input
              id="smb-port"
              inputMode="numeric"
              placeholder="445"
              className="font-mono"
              value={state.smbPort}
              onChange={(event) => patch({ smbPort: event.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Share name" htmlFor="smb-share">
            <Input
              id="smb-share"
              placeholder="music"
              className="font-mono"
              autoCapitalize="none"
              spellCheck={false}
              value={state.smbShare}
              onChange={(event) => patch({ smbShare: event.target.value })}
            />
          </Field>
          <Field label="Subfolder" htmlFor="smb-subpath" hint="Optional folder inside the share.">
            <Input
              id="smb-subpath"
              placeholder="FLAC/Library"
              className="font-mono"
              autoCapitalize="none"
              spellCheck={false}
              value={state.smbSubpath}
              onChange={(event) => patch({ smbSubpath: event.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Username" htmlFor="smb-username" hint="Leave blank for guest access.">
            <Input
              id="smb-username"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              value={state.smbUsername}
              onChange={(event) => patch({ smbUsername: event.target.value })}
            />
          </Field>
          <Field label="Password" htmlFor="smb-password" hint="Stored encrypted on the server.">
            <Input
              id="smb-password"
              type="password"
              autoComplete="new-password"
              disabled={!state.smbUsername.trim() || state.smbClearPassword}
              placeholder={state.smbHasPassword ? "Saved — leave blank to keep" : ""}
              value={state.smbPassword}
              onChange={(event) => patch({ smbPassword: event.target.value })}
            />
          </Field>
          <Field label="Domain / workgroup" htmlFor="smb-domain" hint="Optional.">
            <Input
              id="smb-domain"
              placeholder="WORKGROUP"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              disabled={!state.smbUsername.trim()}
              value={state.smbDomain}
              onChange={(event) => patch({ smbDomain: event.target.value })}
            />
          </Field>
        </div>

        {mode === "edit" && state.smbHasPassword && state.smbUsername.trim() ? (
          <div className="flex items-center gap-2">
            <Checkbox
              id="smb-clear-password"
              checked={state.smbClearPassword}
              onCheckedChange={(checked) => patch({ smbClearPassword: checked === true })}
            />
            <Label htmlFor="smb-clear-password" className="text-muted-foreground text-xs font-normal">
              Clear saved password
            </Label>
          </div>
        ) : null}

        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Host" htmlFor="nfs-host">
          <Input
            id="nfs-host"
            placeholder="nas.local or 192.168.1.50"
            className="font-mono"
            autoCapitalize="none"
            spellCheck={false}
            value={state.nfsHost}
            onChange={(event) => patch({ nfsHost: event.target.value })}
          />
        </Field>
        <Field label="Export path" htmlFor="nfs-export" hint="The path exported by the NFS server.">
          <Input
            id="nfs-export"
            placeholder="/volume1/music"
            className="font-mono"
            autoCapitalize="none"
            spellCheck={false}
            value={state.nfsExportPath}
            onChange={(event) => patch({ nfsExportPath: event.target.value })}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Subfolder" htmlFor="nfs-subpath" hint="Optional folder inside the export.">
          <Input
            id="nfs-subpath"
            placeholder="lossless"
            className="font-mono"
            autoCapitalize="none"
            spellCheck={false}
            value={state.nfsSubpath}
            onChange={(event) => patch({ nfsSubpath: event.target.value })}
          />
        </Field>
        <Field label="NFS version" htmlFor="nfs-version">
          <Select value={state.nfsVersion} onValueChange={(value) => patch({ nfsVersion: value as NfsVersion })}>
            <SelectTrigger id="nfs-version" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="4">NFSv4</SelectItem>
              <SelectItem value="3">NFSv3</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Mount options" htmlFor="nfs-options" hint="Optional comma-separated flags (e.g. timeo=50).">
          <Input
            id="nfs-options"
            placeholder="timeo=50"
            className="font-mono"
            autoCapitalize="none"
            spellCheck={false}
            value={state.nfsOptions}
            onChange={(event) => patch({ nfsOptions: event.target.value })}
          />
        </Field>
      </div>

      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
