"use client";

import { useSyncExternalStore } from "react";

import { capNote, formatOptions, normaliseOptions, qualityOptions, sentSummary, usePlayback } from "~/components/player/playback";
import { usePlayer } from "~/components/player/store";
import { FormSection, SettingRow } from "~/components/shell/form";
import { Page } from "~/components/shell/page";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import type { TranscodeFormat } from "~/server/media/transcode";

const everyFormat: ReadonlySet<TranscodeFormat> = new Set(formatOptions.map((option) => option.value));
let playable: ReadonlySet<TranscodeFormat> | undefined;

/** The convert-to formats this browser says it can play. Asked once, since the answer doesn't change. */
const playableFormats = () =>
  (playable ??= new Set(formatOptions.filter((option) => new Audio().canPlayType(option.type) !== "").map((option) => option.value)));

const never = () => () => {};

/**
 * The web player's audio settings: quality, the format tracks are converted
 * to, and volume levelling. They live in the player store, so they are kept
 * in this browser and a change is heard straight away.
 */
export function PlaybackView() {
  const { cap, quality, format, track, sent } = usePlayback();
  const normalise = usePlayer((state) => state.normalise);
  const { setQuality, setFormat, setNormalise } = usePlayer.getState();
  // The server can't know the browser, so every format is offered until the page is running in one.
  const canPlay = useSyncExternalStore(never, playableFormats, () => everyFormat);
  const formats = formatOptions.map((option) =>
    canPlay.has(option.value) ? option : { ...option, hint: "This browser can't play it", disabled: true },
  );

  return (
    <Page maxWidth="max-w-2xl">
      <FormSection
        title="Web player"
        description="These settings are kept on this device, so each browser you listen in has its own. Music apps have theirs."
      >
        <SettingRow
          label="Quality"
          detail={
            <>
              Anything above this is converted down before it is sent, which uses less data. Original sends each file as it is.
              {cap !== null ? ` ${capNote(cap)}` : null}
            </>
          }
        >
          <Choice label="Quality" options={qualityOptions(cap)} value={quality} onChange={setQuality} />
        </SettingRow>
        <SettingRow label="Convert to" detail="What a track becomes when it is above your quality, or in a format this browser can't play.">
          <Choice label="Convert to" options={formats} value={format} onChange={setFormat} />
        </SettingRow>
        <SettingRow
          label="Even out volume"
          detail="Turns louder tracks down so everything plays at a similar level. Per album keeps the quiet and loud tracks of an album as they are. Tracks without ReplayGain tags are left alone."
        >
          <Choice label="Even out volume" options={normaliseOptions} value={normalise} onChange={setNormalise} />
        </SettingRow>
        {track && sent ? <p className="text-muted-foreground pt-3 text-xs">Current track: {sentSummary(track, sent)}</p> : null}
      </FormSection>
    </Page>
  );
}

/**
 * A setting's choices as a dropdown. The dropdown deals in strings, so each
 * option goes in by its position and comes back out as its own typed value.
 * A hint shows in the list, beside the name, and not on the closed control.
 */
function Choice<T>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; hint?: string; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const chosen = options.findIndex((option) => option.value === value);
  return (
    <Select
      value={chosen === -1 ? "" : String(chosen)}
      onValueChange={(position) => {
        const option = options[Number(position)];
        if (option) onChange(option.value);
      }}
    >
      <SelectTrigger size="sm" aria-label={label} className="w-28">
        <SelectValue>{options[chosen]?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((option, position) => (
          <SelectItem key={option.label} value={String(position)} disabled={option.disabled}>
            {option.label}
            {option.hint ? <span className="text-muted-foreground text-xs">{option.hint}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
