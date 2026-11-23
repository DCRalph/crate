# Crate for iOS

The native app for a Crate server. Expo (SDK 57), expo-router, tRPC with TanStack Query, Zustand. It lives in the server's repo so it can share the API's types and a few plain modules with it.

## What it does

- **Several servers.** Pair with as many as you like and switch between them (Settings, Servers). Each has its own token, key and kept music.
- **Its own connection.** Not Subsonic. The app pairs with an account once (`POST /api/app/pair`) and gets a token of its own, which is an app password on the server: listed under Music apps, with when and where it was last used, and revocable by itself. Everything after that is the server's typed API with that token.
- **Kept playlists.** Press Keep on a playlist and it is fetched to the phone and plays with no connection.
- **Sealed audio.** Kept tracks, and streamed ones by default, come from the server encrypted for this one phone and are stored exactly as they arrive. See below.
- **The Wallbox look.** The same cabinet, print, coral band and amber lamp as the website, by day and by night (`src/lib/theme.ts`).

## How audio is sealed

The server and the phone each have an X25519 key pair. When the phone pairs it reads the server's public key (`GET /api/app/hello`), makes its own pair, and both sides derive the same AES-256 key without it ever being sent. The phone keeps that key in the keychain.

`GET /api/app/sealed/:id` then sends a track as AES-256-GCM in chunks (`src/lib/sealed-format.ts` in the server's source, shared by both). The phone saves the bytes as they are. To play a track it opens the sealed file into its cache folder, plays that, and removes it when the queue has moved on.

So a kept track on the phone's disk is never playable audio, and a sealed track is unreadable on the way even over plain http. What this does not do: the opened copy exists as an ordinary file for as long as it is playing, and with "Keep streamed tracks sealed" off a streamed track is only as private as the connection.

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

That copy carries its own JavaScript and runs without the bundler.

## Layout

- `app/` the pages (expo-router), on a native stack. `(tabs)` holds the library's four pages; an album, a playlist and the settings are pushed over them, and the deck floats over all of it.
- `src/components/glass.tsx` Liquid Glass (a blur before iOS 26), for the tabs, the deck and the round buttons of a page's bar.
- `src/lib/servers.ts` paired servers, pairing, and the keychain.
- `src/lib/sealed.ts` key agreement and opening sealed files.
- `src/lib/downloads.ts` what is kept, and fetching it.
- `src/lib/player.ts` the queue and the audio player.
- `plugins/with-scene-lifecycle.js` goes when the app moves to Expo SDK 58.
