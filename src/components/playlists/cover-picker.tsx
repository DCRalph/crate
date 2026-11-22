"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";

import { Cover } from "~/components/library/cover";
import { FormSection } from "~/components/shell/form";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { useTRPC, type RouterOutputs } from "~/trpc/react";

type Playlist = RouterOutputs["playlists"]["byId"];

/** How many generated covers are offered at a time, besides the one in use. */
const CHOICES = 5;

/** One cover to pick, as a button. The one in use is ringed. */
function Choice({ label, chosen, disabled, onPick, children }: { label: string; chosen: boolean; disabled: boolean; onPick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={chosen}
      disabled={disabled}
      onClick={onPick}
      className={cn(
        "focus-visible:ring-ring/60 w-20 shrink-0 rounded-[5px] p-[3px] outline-none transition-shadow focus-visible:ring-[3px] sm:w-24",
        chosen ? "shadow-[0_0_0_2px_var(--ink)]" : "hover:shadow-[0_0_0_2px_var(--strip-line)]",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Chooses a playlist's cover: one of several generated gradients (with more
 * on request), the art of an album that is in the playlist, or a picture of
 * your own. Whichever was picked last is the cover.
 */
export function CoverPicker({ playlist }: { playlist: Playlist }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  // Each batch is a fresh set of generated covers. The numbers only have to differ from each other.
  const [batch, setBatch] = useState(0);
  const [uploading, setUploading] = useState(false);
  const refresh = () => queryClient.invalidateQueries(trpc.playlists.pathFilter());
  const choose = useMutation(trpc.playlists.setCover.mutationOptions({ onSuccess: refresh, onError: (error) => toast.error(error.message) }));
  const busy = choose.isPending || uploading;

  const generated = !playlist.coverUpload && playlist.coverAlbumId === null;
  const seeds = useMemo(() => {
    const fresh = Array.from({ length: CHOICES }, (_, i) => batch * CHOICES + i + 1);
    // The one in use stays in view while others are tried.
    return [playlist.coverSeed, ...fresh.filter((seed) => seed !== playlist.coverSeed)];
  }, [batch, playlist.coverSeed]);
  const albums = useMemo(() => {
    const seen = new Map<number, string>();
    for (const track of playlist.tracks) if (!seen.has(track.albumId)) seen.set(track.albumId, track.albumName);
    return [...seen].slice(0, 12).map(([id, name]) => ({ id, name }));
  }, [playlist.tracks]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const response = await fetch(`/api/cover/playlist/${playlist.id}`, { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!response.ok) throw new Error((await response.text()) || "Couldn't use that picture.");
      await refresh();
      toast("Cover changed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't use that picture.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <FormSection title="Cover" description="Pick a generated cover, an album from the playlist, or a picture of your own.">
      <div className="flex flex-col gap-5 sm:flex-row">
        <Cover type="playlist" id={playlist.id} version={playlist.coverKey} size={480} className="w-40 shrink-0 self-start" />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <p className="t-label text-muted-foreground text-[11.5px]">Generated</p>
              <Button type="button" variant="ghost" size="xs" onClick={() => setBatch(batch + 1)}>
                <RefreshCw />
                More
              </Button>
            </div>
            <div className="-m-[3px] flex flex-wrap gap-1">
              {seeds.map((seed) => (
                <Choice
                  key={seed}
                  label={generated && seed === playlist.coverSeed ? "Generated cover, in use" : "Use this generated cover"}
                  chosen={generated && seed === playlist.coverSeed}
                  disabled={busy}
                  onPick={() => choose.mutate({ id: playlist.id, seed })}
                >
                  <Cover type="playlist" id={playlist.id} seed={seed} version={playlist.name} size={192} className="w-full" />
                </Choice>
              ))}
            </div>
          </div>

          {albums.length ? (
            <div>
              <p className="t-label text-muted-foreground mb-1.5 text-[11.5px]">From its albums</p>
              <div className="-m-[3px] flex flex-wrap gap-1">
                {albums.map((album) => {
                  const chosen = !playlist.coverUpload && playlist.coverAlbumId === album.id;
                  return (
                    <Choice key={album.id} label={`Use the cover of ${album.name}`} chosen={chosen} disabled={busy} onPick={() => choose.mutate({ id: playlist.id, albumId: album.id })}>
                      <Cover type="album" id={album.id} size={192} className="w-full" />
                    </Choice>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div>
            <p className="t-label text-muted-foreground mb-1.5 text-[11.5px]">Your own</p>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Choose a picture for the cover"
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Cleared, so choosing the same file again still counts as a change.
                event.target.value = "";
                if (file) void upload(file);
              }}
            />
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
              <Upload />
              {playlist.coverUpload ? "Replace picture" : "Upload a picture"}
            </Button>
            <p className="text-muted-foreground mt-1.5 text-xs">{playlist.coverUpload ? "Your picture is the cover. Picking anything above replaces it." : "Cropped to a square. Up to 15 MB."}</p>
          </div>
        </div>
      </div>
    </FormSection>
  );
}
