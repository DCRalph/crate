import "server-only";
import { spawn } from "node:child_process";
import { and, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";

import { inScope, type Scope } from "~/server/access";
import { db } from "~/server/db";
import { track, trackWaveform } from "~/server/db/app-schema";
import { getLibrarySource, type LibrarySource } from "~/server/storage";
import { downsample, loudnessMeter, thumbBuckets, toPeaks, waveformSampleRate, waveformSlices } from "./peaks";

type FileRow = { id: number; path: string; relPath: string; size: number; mtimeMs: number };

/** How long a stored waveform is: base64 of one byte a slice. One of another length was drawn at a different detail. */
const storedLength = 4 * Math.ceil(waveformSlices / 3);

/** Failed tries after which scans leave a file alone, until it changes or a full rescan. */
const maxFailures = 3;

/** Files read at once. Each is an ffmpeg decoding as fast as it can. */
const readers = 4;

/** Whether ffmpeg starts at all. Without it nothing is drawn, and nothing is held against the files. */
function ffmpegRuns() {
  return new Promise<boolean>((resolve) => {
    const ffmpeg = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    ffmpeg.on("error", () => resolve(false));
    ffmpeg.on("close", (code) => resolve(code === 0));
  });
}

/** Decodes a file and measures it. Fails when the file can't be opened or ffmpeg stops short of a clean finish. */
async function readPeaks(source: LibrarySource, relPath: string) {
  const target = await source.ffmpegInput(relPath);
  return new Promise<Uint8Array>((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      ["-v", "error", ...(target.preInputArgs ?? []), "-i", target.input, "-map", "0:a:0", "-ac", "1", "-ar", String(waveformSampleRate), "-f", "s16le", "-"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const meter = loudnessMeter();
    // The end of what ffmpeg said, for the log.
    let said = "";
    ffmpeg.stdout.on("data", (chunk: Uint8Array) => meter.add(chunk));
    ffmpeg.stderr.on("data", (chunk: Buffer) => (said = (said + chunk.toString()).slice(-300)));
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      // An error partway leaves a waveform of part of the track, which would be kept as if it were all of it.
      if (code !== 0) reject(new Error(`ffmpeg exited with ${code ?? "a signal"}. ${said.trim()}`));
      else if (!meter.windows.length) reject(new Error("No audio was decoded."));
      else resolve(toPeaks(meter.windows));
    });
  });
}

/**
 * Works out one track's waveform and keeps it. When the file can't be read a
 * failure is counted against it instead, from one again if the file has
 * changed since the last try.
 */
async function draw(source: LibrarySource, file: FileRow) {
  const peaks = await readPeaks(source, file.relPath).catch((error: unknown) => {
    console.warn(`[waveform] could not draw ${file.path}:`, error instanceof Error ? error.message : error);
    return null;
  });
  const values = peaks
    ? { peaks: Buffer.from(peaks).toString("base64"), size: file.size, mtimeMs: file.mtimeMs, failures: 0, failedAt: null }
    : { peaks: "", size: file.size, mtimeMs: file.mtimeMs, failures: 1, failedAt: new Date() };
  const sameFile = sql`${trackWaveform.size} = excluded.size and ${trackWaveform.mtimeMs} = excluded.mtime_ms`;
  await db
    .insert(trackWaveform)
    .values({ trackId: file.id, ...values })
    .onConflictDoUpdate({
      target: trackWaveform.trackId,
      set: peaks ? values : { ...values, failures: sql`case when ${sameFile} then ${trackWaveform.failures} + 1 else 1 end` },
    });
  return peaks;
}

/**
 * Draws the waveform of every track in a library that doesn't have one,
 * whose file has changed since it was drawn, or whose waveform was drawn at
 * another level of detail. One that failed is tried again by later scans, up
 * to `maxFailures` times, and by every full rescan. Run at the end of a scan,
 * so a track has its waveform from the moment it is imported.
 */
export async function drawWaveforms(libraryId: number, options: { full: boolean; onProgress: (done: number, total: number) => void }) {
  const source = await getLibrarySource(libraryId);
  if (!source) return;
  if (!(await ffmpegRuns())) {
    console.warn("[waveform] ffmpeg can't be started, so no waveforms were drawn. Is it on the PATH?");
    return;
  }
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
          // Empty is a file that failed.
          and(sql`length(${trackWaveform.peaks}) <> ${storedLength}`, options.full ? undefined : lt(trackWaveform.failures, maxFailures)),
        ),
      ),
    );
  let next = 0;
  let done = 0;
  options.onProgress(0, missing.length);
  await Promise.all(
    Array.from({ length: readers }, async () => {
      for (let file = missing[next++]; file; file = missing[next++]) {
        await draw(source, file).catch((error: unknown) => console.warn(`[waveform] could not keep ${file.path}:`, error));
        options.onProgress(++done, missing.length);
      }
    }),
  );
}

/**
 * A track's waveform as numbers from 0 to 255, or null when its file couldn't
 * be read. One that hasn't been drawn yet (a scan still running) is drawn now;
 * one that failed waits for a scan to try it again.
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

/**
 * The small waveform of each track asked for, `thumbBuckets` numbers from 0 to
 * 255, or null for one with no waveform yet or out of the scope's reach. It
 * reads only what scans stored and never decodes, so a page of rows costs one query.
 */
export async function waveformThumbs(scope: Scope, trackIds: number[]) {
  const thumbs: Record<number, number[] | null> = {};
  for (const id of trackIds) thumbs[id] = null;
  if (!trackIds.length) return thumbs;
  const rows = await db
    .select({ trackId: trackWaveform.trackId, peaks: trackWaveform.peaks })
    .from(trackWaveform)
    .innerJoin(track, eq(track.id, trackWaveform.trackId))
    .where(and(inArray(trackWaveform.trackId, trackIds), inScope(track.libraryId, scope)));
  for (const row of rows) if (row.peaks) thumbs[row.trackId] = downsample(Buffer.from(row.peaks, "base64"), thumbBuckets);
  return thumbs;
}
