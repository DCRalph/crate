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
- **Folder playlists.** A rule follows a folder in a library and makes the playlists and folders that match it: a folder that holds folders becomes a folder, a folder that holds tracks becomes a playlist. Or the whole folder can be one playlist. What a rule makes is rebuilt after every scan and is read-only; anyone can make their own copy of a playlist to edit.
- **Playback settings.** The web player can be told to convert down to a chosen quality and format, and to even out volume from ReplayGain tags. An admin's limit on a user always wins.
- **Subsonic API** at `/rest`, version 1.16.1 with the OpenSubsonic `formPost`, `apiKeyAuthentication` and `transcodeOffset` extensions.

## How it is put together

Two APIs sit on one core, so access rules and logging apply to both without being written twice.

- `src/server/access.ts`: `scopeFor(user)` works out which libraries a user reaches. Every library query takes that scope.
- `src/server/library/queries.ts`: every read of the library. `scanner.ts` keeps the database in line with the folders (new and changed files only, unless asked for a full rescan). `cover.ts` resizes and caches cover art under `DATA_DIR`.
- `src/server/subsonic/`: the Subsonic API. `handle.ts` signs the caller in and writes the access log, `handlers.ts` has one function per method, `shapes.ts` is how rows look to clients, `respond.ts` renders JSON or XML.
- `src/server/api/`: the tRPC API the website uses. `routers/admin/` is admin-only, enforced in `trpc.ts`, not by hiding the menu.
- `src/server/list/` and `src/components/data-table/`: the two halves of every admin table. The table sends its search, sort, filters and page; `buildListQuery` turns them into a query using a column map that is also the allowlist.
- `src/server/playlists/`: playlist writes shared by both APIs, the folders playlists sit in (`folders.ts`), and the folder rules (`plan-tree.ts` is the pure part, `folder-rules.ts` applies it).
- `src/server/media/`: file streaming with range requests, and transcoding through ffmpeg.
- `src/server/db/app-schema.ts`: the app's tables. `schema.ts` is better-auth's, written by hand to match the plugins in `src/lib/auth.ts`; change them together, then `bun db:generate`.
- `src/app/(app)`: the signed-in pages. Each `page.tsx` is a server wrapper around a client view that fetches through tRPC. Anything that can be edited has a page of its own, built from the parts in `src/components/shell/form.tsx`. `src/components/player` is the play queue (a Zustand store) and the bar that holds the one audio element.

## Design

The look is called Wallbox: the app as the selector panel of a jukebox. `design-previews/style-guide.html` is the style guide.

- **Two grounds.** The cabinet is seafoam enamel by day and petrol green by night. Print (cards, tables, menus, dialogs) is ivory with ink in both. The player deck is always night.
- **Tokens** are in `src/app/globals.css` under the shadcn names, so components carry no colours of their own. `.print` re-declares them in ivory and ink for everything inside it, and `.night` does the same for the deck.
- **Day and night** follow the device unless someone picks one from the menu under their initial. The choice is kept in the browser, and a script in `<head>` applies it before the first paint (`src/components/shell/theme.tsx`).
- **Type** is Jost, with Big Shoulders for numbers and titles (`t-num`, `t-display`, `font-title`; `t-label` is capitals for strips and keys).
- **Motion** plays once and stops (`animate-rise`, `animate-pop`, `animate-roll`), and all of it yields to reduced motion.

Keyboard: `/` jumps to search, `Space` plays and pauses, and typing a row's number then `Enter` plays that row.

## Reaching it on your network

Sign-in works at the public address (`BETTER_AUTH_URL`) and, with nothing to configure, over the local network: by IP address (`http://192.168.1.20:3000`), by `.local` name, and over Tailscale. For any other name, list it in `ALLOWED_HOSTS`.

- The address is worked out per request (`src/lib/auth.ts`). Requests from any other origin are refused.
- Session cookies are marked Secure when a request came over https and not otherwise (`src/app/api/auth/[...all]/route.ts`). A Secure cookie would never be stored by a browser on plain http, and sign-in would silently do nothing.
- Account shows the server address you are using at that moment, so the address you copy into a music app works from where you are.
- A reverse proxy should pass on `Host` and `X-Forwarded-Proto`. Caddy and Traefik do. nginx needs `proxy_set_header Host $host;` and `proxy_set_header X-Forwarded-Proto $scheme;`.
- `bun dev` can be opened from another device on the network: this machine's addresses are allowed automatically (`allowedDevOrigins` in `next.config.ts`).

## Security notes

- Run it behind a reverse proxy that terminates TLS and sets `X-Forwarded-For`. Logged addresses come from the last entry of that header.
- Subsonic's token login needs the server to know the password, so app passwords are stored encrypted with a key derived from `BETTER_AUTH_SECRET` (and hashed, for API key lookups). Changing the secret invalidates them all.
- Subsonic clients put credentials in the URL. The access log never stores query strings; make sure the proxy's log doesn't either.
- Admin actions aren't available over the Subsonic API at all.
- Repeated failed app sign-ins from one address and username are throttled (10 in 5 minutes) and recorded in the activity log.

## Not built yet

Groups, share links, two-factor and passkeys, importing users and playlists from Navidrome, `.m3u` import, lyrics, a file watcher (scans are by hand or on `SCAN_INTERVAL_MINUTES`), a Dockerfile, and the iOS app.

## Checks

```sh
bun test         # pure logic: XML, ranges, transcode decisions, folder trees
bun typecheck
bun lint
```
