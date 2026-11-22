# Free metadata services for tracks

Research from 23 November 2026. Nothing here is built.

The question was whether a free service can supply more details about the tracks in the library. Several can. The catch for this library is that many files are unreleased dubs, edits and bootlegs, which no database will know.

## Recommendation

1. **AcoustID plus MusicBrainz first.** AcoustID identifies a file from its audio, so it works on files with no tags at all, and it returns a MusicBrainz id. MusicBrainz then gives the canonical artist, title, release, year and label. This is the pair that fixes the tracks still filed under "Unknown Artist" (129 after the file name parsing went in).
2. **Discogs second**, for styles, labels and catalogue numbers. It is the strongest of these for dance music.
3. **BPM and key: analyse the files on the server** instead of looking them up. There is no good free official source any more, and analysis also covers the unreleased files.

Make every lookup opt-in. Each one sends track names or audio fingerprints to an outside service, which this server otherwise never does.

## The services

| Service | Gives you | Cost and limits | Checked |
|---|---|---|---|
| AcoustID | Identifies a file from its audio fingerprint; returns MusicBrainz recording ids | Free for non-commercial use. Needs a free API key and the `fpcalc` tool (Chromaprint) on the server. A widely used client library limits itself to 3 requests a second | Secondary sources only; the official terms page did not come up |
| MusicBrainz | Canonical artist, title, release, year, label, ISRC, and proper multi-artist credits | Free for non-commercial use, no key. Needs a User-Agent that identifies the app. About one request a second per IP | Official rate-limit page found; sources disagree on the exact figure |
| Cover Art Archive | Cover art by MusicBrainz release id | Free | Not checked on the day |
| Discogs | Styles, genres, labels, catalogue numbers, release year | Free with a personal token. 60 requests a minute when authenticated. Needs a descriptive User-Agent | Rate limit confirmed by secondary sources; search-by-style not confirmed |
| GetSongBPM | BPM and key by track name | Free | Not checked on the day; terms unknown |

Not usable:

- **Spotify audio features** (tempo, key, energy): the endpoint was closed to new apps in 2024.
- **AcousticBrainz**: a frozen dataset, not a live service.
- **Apple Music API**: has tempo and key, but needs a paid developer account.

## What to verify before building

- AcoustID's current terms and rate limit, on acoustid.org.
- MusicBrainz's current rate limit. One source says one request a second per IP; another quotes fifty a second per user agent with a per-IP ceiling of one.
- Whether Discogs search can filter by style, and how well it matches white labels and promos.
- Cover Art Archive and GetSongBPM limits and terms.

## How it would fit the app

- **Where it runs:** after a scan, as a background pass over tracks that lack an artist or an id, a few a second at most. Never during a scan, and never on a page load.
- **What is stored:** the outside ids (MusicBrainz recording, release and artist ids, Discogs release id) and when the lookup was made, on the track. What the lookup found is kept beside the file's own tags, not written over them, so a wrong match can be undone.
- **Confidence:** AcoustID returns a score. Accept high scores, queue middling ones for an admin to confirm, drop the rest.
- **Artists:** MusicBrainz artist ids would make joint credits exact and settle the `&` cases that are still joined.
- **Files on disk are never changed.** Writing tags back is a separate decision.
- **Settings:** off by default, switched on per library, with the key or token entered by an admin.

## Sources

- [MusicBrainz API rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)
- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API)
- [AcoustID on Wikipedia](https://en.wikipedia.org/wiki/AcoustID)
- [pyacoustid](https://pypi.org/project/pyacoustid)
- [Discogs rate limits](https://apis.io/rate-limits/discogs/discogs-rate-limits/)
- [Spotify audio features 403 thread](https://community.spotify.com/t5/Spotify-for-Developers/Web-API-Get-Track-s-Audio-Features-403-error/td-p/6654507)
- [AcousticBrainz alternatives write-up](https://dev.to/birrings/acousticbrainz-alternative-in-2026-the-honest-insiders-guide-28kn) (written by a vendor of a paid alternative)
