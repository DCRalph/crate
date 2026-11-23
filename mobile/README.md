# Crate for iOS

The native app for a Crate server. Expo (SDK 57), expo-router, tRPC with TanStack Query, Zustand. It lives in the server's repo so it can share the API's types and a few plain modules with it.

## What it does

- **Several servers.** Pair with as many as you like and switch between them (Settings, Servers). Each has its own token, key and downloads.
- **Its own connection.** Not Subsonic. The app pairs with an account once (`POST /api/app/pair`) and gets a token of its own, which is an app password on the server: listed under Music apps, with when and where it was last used, and revocable by itself. Everything after that is the server's typed API with that token.
- **Playback.** One track runs into the next with no gap, or fades into it (crossfade, in Settings). Volume can be evened out from the ReplayGain in the files. The server converts what the phone can't play, or anything above the quality chosen, with a separate choice for mobile data.
- **The queue.** Press and hold a track to play it next, add it to the queue or to a playlist. Shuffle and repeat are on Now playing, where a held row can be taken out. The queue is saved, so the app opens where it was left, and shared through the server, so another device (or a Subsonic client) offers to carry on from it.
- **Playlists.** Make one, add to it, rename it, reorder it, delete it. The server decides who may: a playlist's owner or an admin, and never one that follows a folder on disk.
- **Downloads.** Press Download on a playlist and it is fetched to the phone and plays with no connection, several tracks at once, carrying on with the app in the background. Settings choose the quality, whether mobile data may be used, and whether a download follows its playlist as it changes on the server.
- **Lock screen and car.** The track, its cover, and Play, Next and Previous show wherever the system puts them: the lock screen, Control Centre, headphones, a car's Now Playing screen. A browsable CarPlay app is not built; it needs an entitlement Apple grants on request. There is a drawn car screen to look at in the simulator (`CARPLAY=1 bunx expo prebuild -p ios`, `modules/car-display`): the cover, the title strip and the track as a waveform. Xcode 27 gives a simulator no CarPlay to connect, so it runs inside the app, under Settings, Car screen, with its keys working. It can't ship as a car's screen, because Apple lets only navigation apps draw on one.
- **Sealed audio.** Downloaded tracks, and streamed ones by default, come from the server encrypted for this one phone and are stored exactly as they arrive. See below.
- **The Wallbox look.** The same cabinet, print, band and amber lamp as the website (`src/lib/theme.ts`). Settings hold it to day or night, or let it follow the phone, and change the band from coral to one of four other colours.

## How audio is sealed

The server and the phone each have an X25519 key pair. When the phone pairs it reads the server's public key (`GET /api/app/hello`), makes its own pair, and both sides derive the same AES-256 key without it ever being sent. The phone keeps that key in the keychain.

`GET /api/app/sealed/:id` then sends a track as AES-256-GCM in chunks (`src/lib/sealed-format.ts` in the server's source, shared by both). The phone saves the bytes as they are. To play a track it opens the sealed file into its cache folder, plays that, and removes it when the queue has moved on.

So a downloaded track on the phone's disk is never playable audio, and a sealed track is unreadable on the way even over plain http. What this does not do: the opened copy exists as an ordinary file for as long as it is playing, and with "Encrypt streamed tracks" off a streamed track is only as private as the connection.

## Running it

```sh
cd mobile
bun install
bunx expo prebuild -p ios        # writes ios/, which is not committed
cd ios && pod install && cd ..
bunx expo run:ios                 # or build in Xcode, then `bun start`
```

The simulator reaches a server on the same Mac at `localhost:3000`.

To put it on a phone, with the phone plugged in or on the same network and unlocked:

```sh
TEAM_ID=XXXXXXXXXX ./scripts/install-ios.sh   # your Apple developer team
```

That copy carries its own JavaScript and runs without the bundler. iCloud for settings needs a profile with the iCloud capability, which Xcode makes when it is signed in to a paid developer account; put `ICLOUD=0` in front to build without it.

## Layout

- `app/` the pages (expo-router), on a native stack. `(tabs)` holds the library's four pages; an album, a playlist and the settings are pushed over them, and the deck floats over all of it.
- `src/components/glass.tsx` Liquid Glass (a blur before iOS 26), for the tabs, the deck and the round buttons of a page's bar.
- `src/lib/servers.ts` paired servers, pairing, and the keychain.
- `src/lib/sealed.ts` key agreement and opening sealed files.
- `src/lib/downloads.ts` what is downloaded, fetching it, and keeping it in step with the server.
- `src/lib/settings.ts` the settings, on the phone and, if asked, in iCloud (`modules/cloud-settings`, the iCloud key-value store). Only settings go to iCloud, never music or sign-ins.
- `src/lib/player.ts` the queue and the two audio players behind it: the next track waits on the one that isn't sounding, which is how there is no gap and how a crossfade overlaps.
- `modules/remote-controls` Next and Previous from the lock screen and a car; the audio library does the rest.
- `plugins/with-scene-lifecycle.js` goes when the app moves to Expo SDK 58.
