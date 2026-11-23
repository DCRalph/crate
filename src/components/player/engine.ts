"use client";

import { useEffect, useEffectEvent, useRef, useState, type ComponentProps } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { webStreamUrl, type StreamDecision } from "~/server/media/transcode";
import { useTRPC } from "~/trpc/react";
import { levelFor } from "~/lib/replay-gain";
import { usePlayback } from "./playback";
import { usePlayer } from "./store";

/** A play counts once the listener is this far in: half the track, or four minutes. */
const playedAfter = (duration: number) => Math.min(duration / 2, 240);

/** Previous goes back a track only this early in one, in seconds. Later than that it starts the track over. */
const restartAfter = 3;

/** How long before a track ends the next one is got ready on the spare element, in seconds. */
const readyAhead = 30;

/** How often a fade moves the volume, in milliseconds. */
const fadeStep = 50;

type Slot = 0 | 1;
const other = (slot: Slot): Slot => (slot === 0 ? 1 : 0);

/** How the audio element's clock maps onto the track it is playing. */
type Clock = {
  /** Seconds into the track where the loaded stream starts. Only a converted stream starts anywhere but 0. */
  offset: number;
  /** Where to move a file to once enough of it has loaded to seek. */
  seekOnLoad: number | null;
};

/** How far into the track the element is, in seconds. */
const positionOf = (clock: Clock, audio: HTMLAudioElement) => clock.seekOnLoad ?? clock.offset + audio.currentTime;

/** Starts the element. Browsers refuse without a click, straight after a page reload say, and the player then shows paused. */
function start(audio: HTMLAudioElement) {
  audio.play().catch((error: unknown) => {
    // Being cut short by the next load or a pause also fails, and isn't a refusal.
    if (error instanceof DOMException && error.name === "NotAllowedError") usePlayer.getState().setPlaying(false);
  });
}

/**
 * Points the element at a track's stream `at` seconds in, starts it if the
 * player is playing, and returns the clock for it. A converted stream has no
 * length and can't be sought, so it is asked for from `at` and the element
 * counts on from there. A file is sent whole and moved to `at` once it has loaded.
 */
function loadStream(audio: HTMLAudioElement, trackId: number, sent: StreamDecision, at: number): Clock {
  audio.src = webStreamUrl(trackId, sent, at);
  if (usePlayer.getState().playing) start(audio);
  return sent.transcode ? { offset: at, seekOnLoad: null } : { offset: 0, seekOnLoad: at > 0 ? at : null };
}

/** Stops an element and lets go of what it had loaded. */
function unload(audio: HTMLAudioElement) {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

/**
 * Everything that makes sound. It follows the player store: a new current
 * track loads, `playing` plays or pauses, and the playback preferences decide
 * what is asked for and how loud it is. The deck draws what this returns and
 * renders the two `<audio>` elements from `deck(0)` and `deck(1)`.
 *
 * There are two elements so that tracks can follow each other without a gap.
 * One is live and plays the current track. As that nears its end the next
 * track is got ready on the spare, and when the queue moves on to it the two
 * change places: at once (no gap), or over a few seconds when a crossfade is
 * set, the outgoing track fading out on what is now the spare. Whatever else
 * is chosen instead simply loads on the live element, as it always did.
 *
 * A file the browser turns out not to play is asked for again as a
 * conversion, once, and only a conversion that fails is reported. The queue
 * then goes on to the next track, and stops if that one fails as well.
 * Nothing is fetched until something is played, so opening the app with a
 * saved queue costs the server nothing.
 */
export function usePlayerEngine() {
  const trpc = useTRPC();
  const first = useRef<HTMLAudioElement>(null);
  const second = useRef<HTMLAudioElement>(null);
  const element = (slot: Slot) => (slot === 0 ? first.current : second.current);
  const { track, sent, decide } = usePlayback();
  const playing = usePlayer((state) => state.playing);
  const volume = usePlayer((state) => state.volume);
  const normalise = usePlayer((state) => state.normalise);
  const turn = usePlayer((state) => state.turn);
  const sleepAt = usePlayer((state) => state.sleep?.at ?? null);
  const { next, previous, setPlaying, markUnplayable } = usePlayer.getState();
  const [time, setTime] = useState(0);
  /** Sound has been asked for and hasn't started: a stream still loading or converting, or one that stalled. */
  const [waiting, setWaiting] = useState(false);

  /** Which element plays the current track. The other is the spare. */
  const live = useRef<Slot>(0);
  const clock = useRef<Clock>({ offset: 0, seekOnLoad: null });
  /** What the live element has loaded, to tell a new play from the same one loaded again. */
  const loaded = useRef<{ trackId: number; turn: number } | undefined>(undefined);
  /** The address the spare has got ready, if any. */
  const ahead = useRef<string | null>(null);
  /** Seconds the coming handover should fade over. Set as a crossfade starts, and used once. */
  const fadeNext = useRef(0);
  /** False once a browser has refused to start the spare from script. Then every track loads on the one element. */
  const canHandOver = useRef(true);
  /** Each element's share of the volume: how much its track is turned down to match the rest, and where a fade has it. */
  const levels = useRef<[number, number]>([1, 1]);
  const gains = useRef<[number, number]>([1, 1]);
  const fades = useRef<[ReturnType<typeof setInterval> | undefined, ReturnType<typeof setInterval> | undefined]>([undefined, undefined]);
  /** Tracks in a row that couldn't be played. */
  const failures = useRef(0);
  /** Counts plays, so each is recorded once however often its stream is loaded (a seek, a change of quality). */
  const plays = useRef(0);
  const recordedPlay = useRef(0);
  const queryClient = useQueryClient();
  // A recorded play changes the counts on track rows and the Most played list, so the ones on screen ask again.
  const recordPlay = useMutation(
    trpc.library.recordPlay.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(trpc.library.trackRows.pathFilter());
        void queryClient.invalidateQueries(trpc.library.mostPlayed.pathFilter());
      },
    }),
  );

  // The saved queue and preferences are read after mount so the first render matches the server's.
  useEffect(() => void usePlayer.persist.rehydrate(), []);

  const applyVolume = (slot: Slot) => {
    const audio = element(slot);
    if (audio) audio.volume = Math.min(1, Math.max(0, usePlayer.getState().volume * levels.current[slot] * gains.current[slot]));
  };
  /** Ends any fade on an element and leaves it at `gain`. */
  const settle = (slot: Slot, gain: number) => {
    clearInterval(fades.current[slot]);
    fades.current[slot] = undefined;
    gains.current[slot] = gain;
    applyVolume(slot);
  };
  /** Moves an element's gain to `to` over `seconds`. */
  const fade = (slot: Slot, to: number, seconds: number, done?: () => void) => {
    clearInterval(fades.current[slot]);
    const from = gains.current[slot];
    const began = performance.now();
    fades.current[slot] = setInterval(() => {
      const along = Math.min(1, (performance.now() - began) / (seconds * 1000));
      gains.current[slot] = from + (to - from) * along;
      applyVolume(slot);
      if (along < 1) return;
      settle(slot, to);
      done?.();
    }, fadeStep);
  };
  /** Empties an element: whatever it was playing or holding ready is gone, and it is back at full gain. */
  const retire = (slot: Slot) => {
    const audio = element(slot);
    if (audio) unload(audio);
    settle(slot, 1);
  };

  /** Where the track that follows the current one streams from, as the queue stands. Null when nothing follows. */
  const upcomingUrl = () => {
    const { queue, index, repeat } = usePlayer.getState();
    const upcoming = repeat === "one" ? queue[index] : (queue[index + 1] ?? (repeat === "all" ? queue[0] : undefined));
    return upcoming ? webStreamUrl(upcoming.id, decide(upcoming)) : null;
  };
  /** Gets the next track ready on the spare, unless it already is or the spare is still fading the last one out. */
  const prepare = () => {
    const slot = other(live.current);
    const spare = element(slot);
    if (!spare || !canHandOver.current || fades.current[slot] !== undefined || usePlayer.getState().sleep?.choice === "track") return;
    const url = upcomingUrl();
    if (!url || url === ahead.current) return;
    ahead.current = url;
    settle(slot, 1);
    spare.preload = "auto";
    spare.src = url;
    spare.load();
  };
  /** Whether the spare holds the track that follows, loaded far enough to start. */
  const spareIsReady = () => {
    const spare = element(other(live.current));
    return !!spare && canHandOver.current && !spare.error && ahead.current !== null && ahead.current === upcomingUrl();
  };

  /** Loads the current track's stream on the live element from `at` seconds in. */
  const load = (audio: HTMLAudioElement, at: number) => {
    if (track && sent) clock.current = loadStream(audio, track.id, sent, at);
  };

  const trackId = track?.id;
  // Where the current track streams from. It changes with the track, and with what the track is sent as.
  const source = track && sent ? webStreamUrl(track.id, sent) : null;
  const onSource = useEffectEvent(() => {
    const from = live.current;
    const audio = element(from);
    if (!audio) return;
    if (!track || !sent) {
      loaded.current = undefined;
      ahead.current = null;
      retire(other(from));
      unload(audio);
      return;
    }
    // The same track from another address, without having been chosen again, is a change of quality or format, or a
    // file that failed and is now converted. Not a new play: it carries on from where it was.
    const samePlay = loaded.current?.trackId === track.id && loaded.current.turn === turn;
    if (!samePlay) plays.current++;
    loaded.current = { trackId: track.id, turn };
    if (samePlay) return load(audio, audio.ended ? 0 : positionOf(clock.current, audio));

    const to = other(from);
    const spare = element(to);
    const seconds = fadeNext.current;
    fadeNext.current = 0;
    if (!spare || !canHandOver.current || spare.error || ahead.current !== source) {
      // Not the track that was got ready (the queue changed, or something else was chosen), so it loads here and the spare is dropped.
      if (ahead.current !== null) retire(to);
      ahead.current = null;
      settle(from, 1);
      return load(audio, 0);
    }

    // The handover: the spare has this track ready, so it becomes the live element.
    ahead.current = null;
    live.current = to;
    clock.current = { offset: 0, seekOnLoad: null };
    levels.current[to] = levelFor(track, normalise);
    if (seconds > 0) {
      fade(to, 1, seconds);
      fade(from, 0, seconds, () => retire(from));
    } else {
      retire(from);
      settle(to, 1);
    }
    setTime(spare.currentTime);
    setWaiting(spare.readyState < HTMLMediaElement.HAVE_FUTURE_DATA);
    if (!usePlayer.getState().playing) return;
    spare.play().catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "NotAllowedError")) return;
      // This browser only lets script play the element the listener started. Go back to it, and stop handing over.
      canHandOver.current = false;
      retire(to);
      live.current = from;
      settle(from, 1);
      clock.current = loadStream(audio, track.id, sent, 0);
    });
  });
  // `turn` as well as the address: choosing the track that is already playing (its row, Next onto a second copy) starts it over.
  useEffect(() => onSource(), [source, turn]);

  const onPlaying = useEffectEvent((isPlaying: boolean) => {
    const audio = element(live.current);
    if (!audio) return;
    if (isPlaying) return start(audio);
    audio.pause();
    // A pause cuts a crossfade short: the outgoing track stops with the rest, and the spare keeps quiet.
    const spare = other(live.current);
    if (fades.current[spare] !== undefined) retire(spare);
    else element(spare)?.pause();
    settle(live.current, 1);
  });
  useEffect(() => {
    if (trackId !== undefined) onPlaying(playing);
  }, [playing, trackId]);

  const level = track ? levelFor(track, normalise) : 1;
  // After the handover above, so the new track's level goes to the element that now plays it. A track fading out keeps its own.
  useEffect(() => {
    levels.current[live.current] = level;
    applyVolume(0);
    applyVolume(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `applyVolume` reads refs and the store, and is new every render.
  }, [volume, level, trackId, turn]);

  // The sleep timer, when it is set to a time. "End of track" is seen to where a track ends.
  useEffect(() => {
    if (sleepAt === null) return;
    const timer = setTimeout(
      () => {
        usePlayer.getState().setPlaying(false);
        usePlayer.getState().setSleep(null);
      },
      Math.max(0, sleepAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [sleepAt]);

  const duration = track?.duration ?? 0;
  const seek = (seconds: number) => {
    const audio = element(live.current);
    if (!audio || !sent) return;
    const to = Math.max(0, seconds);
    // A converted stream can't be sought, so it is loaded again from there. Never from the very end, which would be an empty stream.
    if (sent.transcode) load(audio, Math.min(to, Math.max(duration - 2, 0)));
    // A file that hasn't loaded far enough to seek is moved when it has.
    else if (audio.readyState === 0) clock.current = { offset: 0, seekOnLoad: to };
    else audio.currentTime = to;
    setTime(to);
  };
  /** Moves by so many seconds from where the track is now. */
  const seekBy = (seconds: number) => {
    const audio = element(live.current);
    if (audio && track) seek(Math.min(positionOf(clock.current, audio) + seconds, Math.max(duration - 1, 0)));
  };
  /** Previous, the way every player does it: back a track from the start of one, otherwise back to the start of this one. */
  const back = () => {
    const audio = element(live.current);
    if (audio && usePlayer.getState().index > 0 && positionOf(clock.current, audio) <= restartAfter) return previous();
    seek(0);
    setPlaying(true);
  };

  const onBack = useEffectEvent(back);
  const onSeek = useEffectEvent(seek);
  // A media key on the last track leaves it playing, like the key on the deck, which is switched off there.
  const onSkip = useEffectEvent(() => {
    const { index, queue, repeat } = usePlayer.getState();
    if (index < queue.length - 1 || repeat !== "off") next();
  });
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: track.title,
          artist: track.artistName,
          album: track.albumName,
          artwork: [{ src: `/api/cover/album/${track.albumId}?size=512`, sizes: "512x512", type: "image/jpeg" }],
        })
      : null;
    navigator.mediaSession.setActionHandler("nexttrack", () => onSkip());
    navigator.mediaSession.setActionHandler("previoustrack", () => onBack());
    navigator.mediaSession.setActionHandler("seekto", ({ seekTime }) => {
      if (seekTime !== undefined) onSeek(seekTime);
    });
  }, [track]);

  // While something plays, the browser tab is named after it. The page's own title is kept for when it stops, and
  // put under the track again whenever the page changes it.
  const nowPlaying = track && playing ? `${track.title} · ${track.artistName}` : null;
  useEffect(() => {
    if (!nowPlaying) return;
    let pageTitle = document.title;
    const show = () => {
      if (document.title === nowPlaying) return;
      pageTitle = document.title;
      document.title = nowPlaying;
    };
    show();
    const observer = new MutationObserver(show);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = pageTitle;
    };
  }, [nowPlaying]);

  /** One of the two elements' props. Only the live element is listened to; the spare loads and fades in silence. */
  const deck = (slot: Slot): ComponentProps<"audio"> => {
    const isLive = () => slot === live.current;
    return {
      ref: slot === 0 ? first : second,
      preload: "none",
      onLoadStart: (event) => {
        if (!isLive()) return;
        setWaiting(true);
        setTime(positionOf(clock.current, event.currentTarget));
      },
      onWaiting: () => isLive() && setWaiting(true),
      onCanPlay: () => isLive() && setWaiting(false),
      onPlaying: () => {
        if (!isLive()) return;
        setWaiting(false);
        failures.current = 0;
      },
      onLoadedMetadata: (event) => {
        const { seekOnLoad } = clock.current;
        if (!isLive() || seekOnLoad === null) return;
        clock.current = { offset: 0, seekOnLoad: null };
        event.currentTarget.currentTime = seekOnLoad;
      },
      onTimeUpdate: (event) => {
        if (!isLive() || !track) return;
        const audio = event.currentTarget;
        const now = positionOf(clock.current, audio);
        setTime(now);
        if (recordedPlay.current !== plays.current && now > 0 && now >= playedAfter(track.duration)) {
          recordedPlay.current = plays.current;
          recordPlay.mutate({ trackId: track.id });
        }
        // A file knows its own length better than its tags do. A converted stream has none, so the tags it is.
        const remaining = (Number.isFinite(audio.duration) ? audio.duration : track.duration) - now;
        if (remaining > readyAhead) return;
        prepare();
        // A crossfade starts the next track under this one and moves the queue on; the handover then fades between them.
        const { crossfade, repeat, sleep } = usePlayer.getState();
        const spare = element(other(slot));
        const fits = crossfade > 0 && repeat !== "one" && sleep?.choice !== "track" && track.duration > crossfade * 3;
        if (!fits || !spare || audio.paused || fadeNext.current > 0 || remaining > crossfade || remaining < 0.5) return;
        if (!spareIsReady() || spare.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
        fadeNext.current = remaining;
        gains.current[other(slot)] = 0;
        applyVolume(other(slot));
        void spare.play().catch(() => undefined);
        next();
      },
      onEnded: () => {
        if (!isLive()) return;
        const ended = usePlayer.getState();
        if (ended.sleep?.choice === "track") {
          ended.setSleep(null);
          return setPlaying(false);
        }
        // The next track starts this instant if it is ready, without waiting for the queue to catch up.
        if (spareIsReady()) void element(other(slot))?.play().catch(() => undefined);
        // Repeating one track chooses it again, which starts it over as a new play.
        if (ended.repeat === "one") ended.jump(ended.index);
        else next();
        // The queue ran out. Playing a finished file starts it over; a converted stream has to be loaded again to do that.
        if (!usePlayer.getState().playing && sent?.transcode) seek(0);
      },
      onPlay: () => isLive() && setPlaying(true),
      // Paused from outside (media keys, headphones). Not the pause a track change causes while loading.
      onPause: (event) => {
        if (isLive() && event.currentTarget.readyState > 0 && !event.currentTarget.ended) setPlaying(false);
      },
      onError: (event) => {
        if (!isLive() || !track || !sent) return;
        const code = event.currentTarget.error?.code;
        // The browser said it plays this kind of file and then couldn't load or decode this one. Marking it
        // changes what it is sent as, so it loads again as a conversion and carries on from where it was.
        // That can happen once a track: a marked track is never sent as it is, so its next failure is reported.
        if (!sent.transcode && (code === MediaError.MEDIA_ERR_DECODE || code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED)) {
          markUnplayable(track.id);
          return;
        }
        setWaiting(false);
        toast.error(`Couldn't play ${track.title}.`);
        // One bad file shouldn't stop the music, so the queue goes on. Two in a row means something bigger is wrong.
        const { index, queue } = usePlayer.getState();
        if (++failures.current < 2 && index < queue.length - 1) next();
        else setPlaying(false);
      },
    };
  };

  return { deck, track, sent, playing, time, duration, loading: playing && waiting, seek, seekBy, back };
}
