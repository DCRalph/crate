/**
 * Slices a waveform is stored in. The deck draws a bar every pixel and a
 * half, so this is enough for one about 1,500 pixels wide; a narrower one
 * makes each bar as loud as the loudest slice under it.
 */
export const waveformSlices = 1000;

/** The sample rate the audio is read at. Loudness doesn't need more, and less to decode is quicker. */
export const waveformSampleRate = 4000;

/** Samples measured together: 20 ms. */
const windowSamples = waveformSampleRate / 50;

/**
 * Measures how loud 16-bit mono audio is, window by window, as it arrives in
 * chunks. A chunk can end halfway through a sample; the odd byte waits for the next.
 */
export function loudnessMeter() {
  const windows: number[] = [];
  let sum = 0;
  let counted = 0;
  let carry: number | null = null;

  const take = (sample: number) => {
    sum += sample * sample;
    if (++counted < windowSamples) return;
    windows.push(Math.sqrt(sum / counted));
    sum = 0;
    counted = 0;
  };

  return {
    windows,
    add(chunk: Uint8Array) {
      let at = 0;
      if (carry !== null && chunk.length) {
        take(((chunk[0]! << 8) | carry) << 16 >> 16);
        carry = null;
        at = 1;
      }
      for (; at + 1 < chunk.length; at += 2) take(((chunk[at + 1]! << 8) | chunk[at]!) << 16 >> 16);
      if (at < chunk.length) carry = chunk[at]!;
    },
  };
}

/**
 * Fits a track's windows into `slices` bytes, each the loudest window under
 * it, scaled so the loudest part of the track is 255. A gentle curve lifts
 * the quiet parts, which would otherwise read as nothing at all.
 */
export function toPeaks(windows: readonly number[], slices = waveformSlices) {
  const peaks = new Uint8Array(slices);
  if (!windows.length) return peaks;
  const loudest = Math.max(...windows, 1);
  for (let slice = 0; slice < slices; slice++) {
    const from = Math.floor((slice * windows.length) / slices);
    const to = Math.max(from + 1, Math.floor(((slice + 1) * windows.length) / slices));
    let peak = 0;
    for (let i = from; i < to && i < windows.length; i++) peak = Math.max(peak, windows[i]!);
    peaks[slice] = Math.round(255 * (peak / loudest) ** 0.7);
  }
  return peaks;
}
