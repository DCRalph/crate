# Product

<!-- impeccable:product-schema 1 -->

Written from what the owner has said in conversation and from the built app. Nothing here was confirmed in an interview; lines marked (inferred) are my reading.

## Platform

web

## Users

- The owner, who runs the server at home and is its admin. He adds libraries, makes accounts, decides who reaches what, and reads the logs.
- People he gives accounts to (inferred: family and friends). They listen in a browser on a desktop or a phone, and through Subsonic apps on their own devices.

## Product Purpose

A self-hosted media server that replaces Navidrome. It exists because Navidrome's handling of users, permissions, logging, security and folder-driven playlists was not enough. Success is the owner preferring it to Navidrome day to day, and other people using it without help.

## Positioning

A personal server with the access control of a shared one: access is granted per library per person, every device signs in with its own revocable password, every request is logged, and playlists and folders can mirror the folders on disk.

## Operating Context

- Music lives as files in folders on the server. Some folders are curated by hand (mixes, sets) and should become playlists as they are.
- Listening happens in the web app and in any Subsonic client.
- Planned, not built: movies and TV alongside music, a native iOS app, and syncing media to an external SSD for offline use.

## Capabilities and Constraints

- Subsonic API 1.16.1 with OpenSubsonic extensions; web app; admin for users, libraries, folder playlists and logs.
- Stack: Next.js, tRPC, Drizzle on Postgres, better-auth, Tailwind, shadcn.
- Motion plays once and stops; nothing loops while idle. No em dashes in copy. Minimal copy.

## Brand Commitments

- Working name: Crate (chosen by the agent, not confirmed by the owner).
- The owner wants this project to look unlike his other projects, which share a true-black console style.

## Evidence on Hand

A small demo library under `data/music`. No customers, testimonials or metrics exist; none may be invented.

## Product Principles

1. The owner is always able to see who did what, and to stop it.
2. Access rules live in one place and apply to every way in.
3. The files on disk are the source of truth; the server follows them.
4. Simple first: one obvious way to do each thing.
