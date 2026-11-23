import "server-only";
import { spawn } from "node:child_process";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "~/server/db";
import { track, trackWaveform } from "~/server/db/app-schema";
import { getLibrarySource, type LibrarySource } from "~/server/storage";
import { loudnessMeter, toPeaks, waveformSampleRate, waveformSlices } from "./peaks";

type FileRow = { id: number; path: string; relPath: string; size: number; mtimeMs: number };

/** How long a stored waveform is: base64 of one byte a slice. One of another length was drawn at a different detail. */
const storedLength = 4 * Math.ceil(waveformSlices / 3);

/** Files read at once. Each is an ffmpeg decoding as fast as it can. */
const readers = 4;

/** Decodes a file and measures it. Null when ffmpeg can't read it. */
async function readPeaks(source: LibrarySource, relPath: string) {
  let target: { input: string; preInputArgs?: string[] };
  try {
    target = await source.ffmpegInput(relPath);
  } catch {
    return null;
  }
  return new Promise<Uint8Array | null>((resolve) => {
    const ffmpeg = spawn(
      "ffmpeg",
      ["-v", "error", ...(target.preInputArgs ?? []), "-i", target.input, "-map", "0:a:0", "-ac", "1", "-ar", String(waveformSampleRate), "-f", "s16le", "-"],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    const meter = loudnessMeter();
    ffmpeg.stdout.on("data", (chunk: Uint8Array) => meter.add(chunk));
    ffmpeg.on("error", () => resolve(null));
    ffmpeg.on("close", () => resolve(meter.windows.length ? toPeaks(meter.windows) : null));
  });
}

/** Works out one track's waveform and keeps it. A file that can't be read is kept as empty, so it isn't tried again until it changes. */
async function draw(source: LibrarySource, file: FileRow) {
  const peaks = await readPeaks(source, file.relPath);
  const values = { peaks: peaks ? Buffer.from(peaks).toString("base64") : "", size: file.size, mtimeMs: file.mtimeMs };
  await db
    .insert(trackWaveform)
    .values({ trackId: file.id, ...values })
    .onConflictDoUpdate({ target: trackWaveform.trackId, set: values });
  return peaks;
}

/**
 * Draws the waveform of every track in a library that doesn't have one,
 * whose file has changed since it was drawn, or whose waveform was drawn at
 * another level of detail. Run at the end of a scan, so a track has its
 * waveform from the moment it is imported.
 */
export async function drawWaveforms(libraryId: number, onProgress: (done: number, total: number) => void) {
  const source = await getLibrarySource(libraryId);
  if (!source) return;
  const missing = await db
    .select({ id: track.id, path: track.path, relPath: track.relPath, size: track.size, mtimeMs: track.mtimeMs })
    .from(track)
    .leftJoin(trackWaveform, eq(trackWaveform.trackId, track.id))
    .where(
      and(
        eq(track.libraryId, libraryId),
        or(
          isNull(trackWaveform.trackId),
          ne(trackWaveform.size, track.size),
          ne(trackWaveform.mtimeMs, track.mtimeMs),
          // Empty is a file that couldn't be read, which is left alone.
          sql`length(${trackWaveform.peaks}) not in (0, ${storedLength})`,
        ),
      ),
    );
  let next = 0;
  let done = 0;
  onProgress(0, missing.length);
  await Promise.all(
    Array.from({ length: readers }, async () => {
      for (let file = missing[next++]; file; file = missing[next++]) {
        await draw(source, file).catch((error: unknown) => console.warn(`[waveform] could not draw ${file.path}:`, error));
        onProgress(++done, missing.length);
      }
    }),
  );
}

/**
 * A track's waveform as numbers from 0 to 255, or null when its file can't be
 * read. One that hasn't been drawn yet (a scan still running) is drawn now.
 */
export async function waveformOf(trackId: number) {
  const [saved] = await db.select({ peaks: trackWaveform.peaks }).from(trackWaveform).where(eq(trackWaveform.trackId, trackId));
  if (saved) return saved.peaks ? [...Buffer.from(saved.peaks, "base64")] : null;
  const [file] = await db
    .select({ id: track.id, libraryId: track.libraryId, path: track.path, relPath: track.relPath, size: track.size, mtimeMs: track.mtimeMs })
    .from(track)
    .where(eq(track.id, trackId));
  if (!file) return null;
  const source = await getLibrarySource(file.libraryId);
  const peaks = source ? await draw(source, file) : null;
  return peaks ? [...peaks] : null;
}
