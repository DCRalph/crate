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
- **Folder playlists.** A rule turns a folder into playlists: one per subfolder, one per folder that holds tracks, or the folder as a whole. Mirror rules follow the disk on every scan and are read-only; import-once rules make ordinary playlists.
- **Subsonic API** at `/rest`, version 1.16.1 with the OpenSubsonic `formPost`, `apiKeyAuthentication` and `transcodeOffset` extensions.

## How it is put together

Two APIs sit on one core, so access rules and logging apply to both without being written twice.

- `src/server/access.ts`: `scopeFor(user)` works out which libraries a user reaches. Every library query takes that scope.
- `src/server/library/queries.ts`: every read of the library. `scanner.ts` keeps the database in line with the folders (new and changed files only, unless asked for a full rescan). `cover.ts` resizes and caches cover art under `DATA_DIR`.
- `src/server/subsonic/`: the Subsonic API. `handle.ts` signs the caller in and writes the access log, `handlers.ts` has one function per method, `shapes.ts` is how rows look to clients, `respond.ts` renders JSON or XML.
- `src/server/api/`: the tRPC API the website uses. `routers/admin.ts` is admin-only, enforced in `trpc.ts`, not by hiding the menu.
- `src/server/playlists/`: playlist writes shared by both APIs, and the folder rules (`group-tracks.ts` is the pure part).
- `src/server/media/`: file streaming with range requests, and transcoding through ffmpeg.
- `src/server/db/app-schema.ts`: the app's tables. `schema.ts` is better-auth's, written by hand to match the plugins in `src/lib/auth.ts`; change them together, then `bun db:generate`.
- `src/app/(app)`: the signed-in pages. Each `page.tsx` is a server wrapper around a client view that fetches through tRPC. `src/components/player` is the play queue (a Zustand store) and the bar that holds the one audio element.

## Design

`design-previews/style-guide.html` is the style guide. Tokens, the `t-label`, `t-display` and `font-title` utilities, and the motion (`animate-rise`, `animate-spin-once`, `animate-pop`, `eq-bars`) are in `src/app/globals.css`. Dark only. Every animation plays once and stops, and all of it yields to reduced motion.

Keyboard: `/` jumps to search, `Space` plays and pauses.

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
bun test         # pure logic: XML, ranges, transcode decisions, folder grouping
bun typecheck
bun lint
```
