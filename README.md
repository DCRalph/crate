# Crate

A self-hosted music server: a web app and admin console, plus a Subsonic API so existing music apps work with it. Next.js, tRPC, Drizzle, better-auth, Tailwind 4, shadcn. "Crate" is a working name, set in `src/lib/site.ts`.

```sh
bun install
cp .env.example .env.local       # set BETTER_AUTH_SECRET
bun db:up                        # Postgres in Docker, port 5439
bun db:migrate
bun create-admin you "Your Name" # prints a password once
bun dev
```

Sign in, add a library under Admin > Libraries (a folder path on the server), and it scans straight away. `ffmpeg` on the PATH is needed for transcoding; everything else works without it.

## What it does

- **Access control.** A library is a root folder. Users reach a library only when an admin grants it, with downloads as a separate permission, and can be given a streaming bitrate cap. Admins reach everything. Accounts are made by admins; there is no sign-up.
- **App passwords.** Subsonic apps never see the account password. Each app gets its own generated password from Account, shown once, revocable on its own, with when and where it was last used.
- **Logs.** Admin > Activity has three: sign-ins and every change (who, what, from where), every Subsonic and media request, and every play.
- **Playlist folders.** Playlists sit in a tree. Folders hold folders and playlists; a playlist is always a leaf. Subsonic apps, which have no folders, see a playlist's folders in its name ("Mixes / 2025 / Summer").
- **Who can listen.** A playlist or folder is for its owner only, everyone on the server, or chosen people. Anything without a setting of its own follows the folder it is in, and at the top level only its owner listens. Sharing is for listening: only the owner and admins edit, and people still only see and hear tracks from libraries they reach. Every change is in the activity log, including a move into or out of a folder (or of where a folder rule puts what it makes) that changes who listens. Subsonic apps see a playlist everyone can listen to as public.
- **Folder playlists.** A rule follows a folder in a library and makes the playlists and folders that match it: a folder that holds folders becomes a folder, a folder that holds tracks becomes a playlist. Or the whole folder can be one playlist. What a rule makes is rebuilt after every scan and is read-only; anyone can make their own copy of a playlist to edit. The rule says who can listen to what it makes, and its owner can give any folder or playlist in it a setting of its own, which outlasts rescans and rebuilds. A rebuild never changes who can listen to a playlist that was already there, even when its folder on disk gains or loses its subfolders. Rules are set up on each library's page in Admin.
- **Playlist files.** A `.m3u` or `.m3u8` file inside a followed folder sets that folder's playlist: its tracks and their order. Several files in one folder each become a playlist.
- **Artists.** A joint credit ("A, B feat. C", "A/B", "A x B") is split into its artists, using a file's own multi-value tags when it has them. "A & B" is split only when one of the two also appears alone, so duos stay whole. Tracks keep showing the full credit. Files with no tags take artist and title from an "Artist - Title" file name.
- **Tracks.** One table of every track, with search, sorting and filters. Any track or playlist has Get info.
- **Any format in the browser.** The browser says what it can play; anything else (AIFF, for one) is converted on the way out, and a file that fails as it is gets retried as a conversion.
- **Playlist covers** are generated: a grainy gradient coloured from the playlist's own album art. Its owner can pick another generated one, the art of an album in the playlist, or upload a picture.
- **Albums without art** get a cover drawn for them: a record whose label is in a colour of its own and carries the album's first letter. It is the same every time, on the website, in the iOS app and in Subsonic apps, and its tracks and artists show it too.
- **Playlists page.** A folder tree or a grid of covers, with any playlist pinned to the top of your own list.
- **Most played.** Everyone's top 50 tracks over the last 30 days, 90 days or all time, worked out from their own plays each time it is opened, so it is never stale. It is a page on the rail and opens from the top of Playlists, and Subsonic apps see the last 90 days as a read-only playlist.
- **Playback settings.** The web player can be told to convert down to a chosen quality and format, and to even out volume from ReplayGain tags. An admin's limit on a user always wins.
- **Home.** The playlists you pinned, the albums you last played, what is newest, and what you play most, each row lettered so any tile can be played by its code ("B3").
- **Now playing.** The console's cover, its key or `V` opens the track that is playing over the glass, in one of two ways that it remembers. Detailed has the cover, the waveform large, everything known about the file and your plays, and what is up next. Minimal is the cover on its own blurred art, with keys that step back when the pointer is still; `F` takes it to full screen.
- **Your playlists always in reach.** The rail down the side holds the pages, your pinned playlists and your whole playlist tree, with folders that open in place.
- **The console.** Each track is drawn as its waveform, measured from the audio when it is scanned, and that is what you seek on. Every track row also shows its waveform small, and how often you have played it. Tracks follow each other with no gap, or over a crossfade if you set one. Shuffle, repeat, a queue you can reorder, a sleep timer, and keyboard shortcuts (press `?` for the list).
- **Selecting.** Click, Shift-click or Ctrl/Cmd-click tracks, then queue them or add them to a playlist together. A right-click on a track, an album or a playlist brings up its menu.
- **An iOS app** of its own, in [`mobile/`](mobile/README.md). It pairs with a server (several, if you have them) over the server's own API, not Subsonic, and shows under Music apps like any other device. Playlists can be downloaded to the phone, and audio it downloads arrives encrypted for that one phone. It plays without gaps or with a crossfade, and its queue is shared with your other devices through the server.
- **Subsonic API** at `/rest`, version 1.16.1 with the OpenSubsonic `formPost`, `apiKeyAuthentication` and `transcodeOffset` extensions.

## How it is put together

Two APIs sit on one core, so access rules and logging apply to both without being written twice.

- `src/server/access.ts`: `scopeFor(user)` works out which libraries a user reaches. Every library query takes that scope.
- `src/server/library/queries.ts`: every read of the library. `scanner.ts` keeps the database in line with the folders (new and changed files only, unless asked for a full rescan). `cover.ts` resizes and caches cover art under `DATA_DIR`, and draws a record label (`label-cover.ts`) for albums that have none. The label's letter is drawn from outlines taken out of the font by `scripts/label-glyphs.ts`, so no font is needed on the server.
- `src/server/subsonic/`: the Subsonic API. `handle.ts` signs the caller in and writes the access log, `handlers.ts` has one function per method, `shapes.ts` is how rows look to clients, `respond.ts` renders JSON or XML.
- `src/server/api/`: the tRPC API the website uses. `routers/admin/` is admin-only, enforced in `trpc.ts`, not by hiding the menu.
- `src/server/list/` and `src/components/data-table/`: the two halves of every admin table. The table sends its search, sort, filters and page; `buildListQuery` turns them into a query using a column map that is also the allowlist.
- `src/server/playlists/`: playlist writes shared by both APIs, the folders playlists sit in (`folders.ts`), and the folder rules (`plan-tree.ts` is the pure part, `folder-rules.ts` applies it). Who can listen is worked out in one place, `resolve-audience.ts`, from the tree that `loadAudiences` in `queries.ts` reads in two queries; `listPlaylists` uses it, so every way in agrees. Reads that work it out share one `snapshot`, and changes to it wait for rebuilds under way (`lockAudiences` in `folder-rules.ts`), which compare it before and after. `audience.ts` reads and saves the settings.
- `src/server/media/`: file streaming with range requests, and transcoding through ffmpeg.
- `src/server/db/app-schema.ts`: the app's tables. `schema.ts` is better-auth's, written by hand to match the plugins in `src/lib/auth.ts`; change them together, then `bun db:generate`.
- `src/app/(app)`: the signed-in pages. Each `page.tsx` is a server wrapper around a client view that fetches through tRPC. Anything that can be edited has a page of its own, built from the parts in `src/components/shell/form.tsx`. `src/components/player` is the play queue (a Zustand store) and the bar that holds the one audio element.

## Design

The look is called Wallbox: the app as a jukebox, built as one machine. An enamel cabinet holds a rail of pages down its side, a glass window that every page is shown behind, and a console along the bottom. One rule decides every surface: glass shows, print lists, keys act. `design-previews/style-guide.html` is the original style guide for the parts (strips, plates, lamps, keys).

- **Three grounds.** The cabinet is seafoam enamel by day and petrol green by night. Glass and the console are dark at any hour, so covers and lamps read the same by day and by night. Print (cards, tables, menus, dialogs) is ivory with ink in both.
- **Materials** are utilities in `src/app/globals.css`, all of them still paint: `enamel` (grain, lit from above), `glass-window` and `glass-bevel`, `glass-inset` (the console's little windows), `console`, `key` (a key with travel and a chrome lip), `lamp`, `plate`, and `glow`, a cover lit from underneath in its own colour, read from the picture as it loads (`src/components/library/cover.tsx`). `glow-lit` is what is playing: an amber ring. Amber means live and nothing else.
- **Tokens** are in `src/app/globals.css` under the shadcn names, so components carry no colours of their own. `.print` re-declares them in ivory and ink for everything inside it, `.night` does the same for the console, and `.glass` for the window.
- **Selection codes.** A list's rows are numbered; on a page with several rows of tiles each row has a letter and each tile a code ("B3"). Typing one and `Enter` plays it, and the console's window shows what is typed (`src/components/player/selection.ts`).
- **Day and night** follow the device unless someone picks one from the menu under their name. The choice is kept in the browser, and a script in `<head>` applies it before the first paint (`src/components/shell/theme.tsx`).
- **Type** is Jost, with Big Shoulders for numbers and titles (`t-num`, `t-display`, `font-title`; `t-label` is capitals for strips and keys).
- **Motion** plays once and stops (`animate-rise`, `animate-pop`, `animate-roll`, `animate-arrive`), nothing loops, and all of it yields to reduced motion. Going from page to page is a view transition of the page's own scroller, so it stays inside the glass: the old page fades as the new one rises, a cover travels from its tile to the page it opens, and the rail and console change at once (`src/components/shell/transitions.tsx`).

Keyboard: `/` jumps to search, `Space` plays and pauses, and typing a row's number (or a tile's code) then `Enter` plays it.

## Reaching it on your network

Sign-in works at the public address (`BETTER_AUTH_URL`) and, with nothing to configure, over the local network: by IP address (`http://192.168.1.20:3000`), by `.local` name, and over Tailscale. For any other name, list it in `ALLOWED_HOSTS`.

- The address is worked out per request (`src/lib/auth.ts`). Requests from any other origin are refused.
- Session cookies are marked Secure when a request came over https and not otherwise (`src/app/api/auth/[...all]/route.ts`). A Secure cookie would never be stored by a browser on plain http, and sign-in would silently do nothing.
- Account shows the server address you are using at that moment, so the address you copy into a music app works from where you are.
- A reverse proxy should pass on `Host` and `X-Forwarded-Proto`. Caddy and Traefik do. nginx needs `proxy_set_header Host $host;` and `proxy_set_header X-Forwarded-Proto $scheme;`.
- `bun dev` can be opened from another device on the network, or over a VPN: every private address is allowed (`allowedDevOrigins` in `next.config.ts`).

## Security notes

- Run it behind a reverse proxy that terminates TLS and sets `X-Forwarded-For`. Logged addresses come from the last entry of that header.
- Subsonic's token login needs the server to know the password, so app passwords are stored encrypted with a key derived from `BETTER_AUTH_SECRET` (and hashed, for API key lookups). Changing the secret invalidates them all.
- Subsonic clients put credentials in the URL. The access log never stores query strings; make sure the proxy's log doesn't either.
- Admin actions aren't available over the Subsonic API at all.
- Repeated failed app sign-ins from one address and username are throttled (10 in 5 minutes) and recorded in the activity log.

## Not built yet

Groups, share links, two-factor and passkeys, importing users and playlists from Navidrome, lyrics, looking tracks up in an online database, a file watcher (scans are by hand or on `SCAN_INTERVAL_MINUTES`) and a Dockerfile. The iOS app has no search, no artists page, no browsable CarPlay app and no Android build yet, and the website does not yet save or pick up the queue the app shares between devices.

## Checks

```sh
bun test         # pure logic: XML, ranges, transcode decisions, folder trees
bun typecheck
bun lint
```
