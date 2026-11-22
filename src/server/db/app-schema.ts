// Everything the app owns. better-auth's tables are in schema.ts.
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { user } from "./schema";

const id = () => integer("id").primaryKey().generatedAlwaysAsIdentity();
const createdAt = () => timestamp("created_at").defaultNow().notNull();

/** What the last scan of a library did. */
export type ScanResult = {
  added: number;
  updated: number;
  removed: number;
  failed: number;
  durationMs: number;
  /** Set when the scan stopped early, e.g. the folder was unreachable. */
  error?: string;
};

/** A root folder of music. Access is granted per library. */
export const library = pgTable("library", {
  id: id(),
  name: text("name").notNull(),
  /** Absolute path on the server. */
  path: text("path").notNull().unique(),
  createdAt: createdAt(),
  lastScanAt: timestamp("last_scan_at"),
  lastScan: jsonb("last_scan").$type<ScanResult>(),
});

/**
 * Who can reach a library. A row means browse and stream; `canDownload` adds
 * original-file downloads. Admins reach everything and have no rows.
 */
export const libraryAccess = pgTable(
  "library_access",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    libraryId: integer("library_id")
      .notNull()
      .references(() => library.id, { onDelete: "cascade" }),
    canDownload: boolean("can_download").default(false).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.libraryId] })],
);

/** Artists are shared across libraries; one is visible when it has something in a library you can reach. */
export const artist = pgTable("artist", {
  id: id(),
  name: text("name").notNull(),
  /** Lowercased, trimmed name: what makes two spellings the same artist. */
  nameKey: text("name_key").notNull().unique(),
  createdAt: createdAt(),
});

/**
 * An album lives in exactly one library, which is what makes access checks one
 * filter. It is one album for as long as its tags agree on the album artist
 * credit and the name.
 */
export const album = pgTable(
  "album",
  {
    id: id(),
    libraryId: integer("library_id")
      .notNull()
      .references(() => library.id, { onDelete: "cascade" }),
    /** The first artist on the album artist credit. */
    artistId: integer("artist_id")
      .notNull()
      .references(() => artist.id),
    /** The album artist as shown: the tag as written, or its values joined ("Wilkinson, Kelli-Leigh"). */
    artistCredit: text("artist_credit").notNull(),
    name: text("name").notNull(),
    year: integer("year"),
    genre: text("genre"),
    /** A cover image file found beside the tracks, if any. Embedded art is read on demand. */
    coverPath: text("cover_path"),
    // Kept in step by the scanner so lists don't aggregate tracks.
    trackCount: integer("track_count").default(0).notNull(),
    duration: integer("duration").default(0).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("album_identity_idx").on(t.libraryId, t.artistCredit, t.name),
    index("album_artist_idx").on(t.artistId),
  ],
);

export const track = pgTable(
  "track",
  {
    id: id(),
    libraryId: integer("library_id")
      .notNull()
      .references(() => library.id, { onDelete: "cascade" }),
    albumId: integer("album_id")
      .notNull()
      .references(() => album.id, { onDelete: "cascade" }),
    /** The first credited artist. Everyone credited is in `trackArtist`. */
    artistId: integer("artist_id")
      .notNull()
      .references(() => artist.id),
    /** The artist line as shown: the tag as written, or its values joined ("Fred again.., Anderson .Paak, CHIKA"). */
    artistCredit: text("artist_credit").notNull(),
    title: text("title").notNull(),
    trackNumber: integer("track_number"),
    discNumber: integer("disc_number"),
    year: integer("year"),
    genre: text("genre"),
    /** Seconds. */
    duration: integer("duration").default(0).notNull(),
    /** kbps. */
    bitRate: integer("bit_rate"),
    size: bigint("size", { mode: "number" }).notNull(),
    suffix: text("suffix").notNull(),
    contentType: text("content_type").notNull(),
    /** Absolute path. A track keeps its id for as long as its file stays here. */
    path: text("path").notNull().unique(),
    /** Path inside the library, with forward slashes. Folder playlists group on this. */
    relPath: text("rel_path").notNull(),
    /** With `size`, how the scanner knows a file hasn't changed. */
    mtimeMs: bigint("mtime_ms", { mode: "number" }).notNull(),
    // ReplayGain tags, when the file has them: gain in dB, peak as a ratio of full scale.
    trackGain: real("track_gain"),
    albumGain: real("album_gain"),
    trackPeak: real("track_peak"),
    albumPeak: real("album_peak"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("track_album_idx").on(t.albumId),
    index("track_artist_idx").on(t.artistId),
    index("track_library_idx").on(t.libraryId, t.relPath),
    index("track_genre_idx").on(t.genre),
  ],
);

/**
 * Everyone credited on a track, in the order the credit names them. Position 0
 * is `track.artistId`. A joint credit ("Total Science/FD") is one row each.
 */
export const trackArtist = pgTable(
  "track_artist",
  {
    trackId: integer("track_id")
      .notNull()
      .references(() => track.id, { onDelete: "cascade" }),
    artistId: integer("artist_id")
      .notNull()
      .references(() => artist.id),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.trackId, t.artistId] }), index("track_artist_artist_idx").on(t.artistId)],
);

export const annotationTypes = ["track", "album", "artist"] as const;
export type AnnotationType = (typeof annotationTypes)[number];

/** A user's star and rating on a track, album or artist. */
export const annotation = pgTable(
  "annotation",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    itemType: text("item_type", { enum: annotationTypes }).notNull(),
    itemId: integer("item_id").notNull(),
    starredAt: timestamp("starred_at"),
    rating: integer("rating"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemType, t.itemId] })],
);

export const folderRuleModes = ["tree", "folder"] as const;
export type FolderRuleMode = (typeof folderRuleModes)[number];

/**
 * Keeps playlists in step with a folder inside a library. What it makes
 * follows the disk and is read-only; copy a playlist to get one you can edit.
 *  - mode `tree`: folders and playlists that match the folder tree. A folder
 *    that holds tracks is a playlist; one that holds folders is a folder.
 *  - mode `folder`: the folder and everything under it is one playlist.
 */
export const folderRule = pgTable("folder_rule", {
  id: id(),
  libraryId: integer("library_id")
    .notNull()
    .references(() => library.id, { onDelete: "cascade" }),
  /** Path inside the library, forward slashes, "" for the library root. */
  path: text("path").notNull(),
  mode: text("mode", { enum: folderRuleModes }).notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  isPublic: boolean("is_public").default(true).notNull(),
  /** The owner's folder that what this rule makes sits inside. Null puts it at the top. */
  parentFolderId: integer("parent_folder_id").references((): AnyPgColumn => playlistFolder.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/**
 * A folder in someone's playlist tree. Folders hold folders and playlists;
 * playlists are always the leaves. Other people see a folder only when it
 * leads to a playlist they can see.
 */
export const playlistFolder = pgTable(
  "playlist_folder",
  {
    id: id(),
    name: text("name").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    parentId: integer("parent_id").references((): AnyPgColumn => playlistFolder.id, { onDelete: "cascade" }),
    /** Set on folders a folder rule made, with the disk folder each stands for. Those follow the disk, so nobody edits them. */
    ruleId: integer("rule_id").references(() => folderRule.id, { onDelete: "cascade" }),
    sourcePath: text("source_path"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("playlist_folder_source_idx").on(t.ruleId, t.sourcePath),
    index("playlist_folder_owner_idx").on(t.ownerId),
    index("playlist_folder_parent_idx").on(t.parentId),
  ],
);

export const playlist = pgTable(
  "playlist",
  {
    id: id(),
    name: text("name").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Visible to everyone. They still only see the tracks their libraries allow. */
    isPublic: boolean("is_public").default(false).notNull(),
    comment: text("comment"),
    /** Where it sits in its owner's tree. Null is the top level. */
    folderId: integer("folder_id").references(() => playlistFolder.id, { onDelete: "set null" }),
    /** The folder rule that made this playlist, and the folder it came from. */
    ruleId: integer("rule_id").references(() => folderRule.id, { onDelete: "set null" }),
    sourcePath: text("source_path"),
    /** Playlists made by a folder rule follow the disk, so nobody edits them. */
    readOnly: boolean("read_only").default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("playlist_source_idx").on(t.ruleId, t.sourcePath),
    index("playlist_owner_idx").on(t.ownerId),
    index("playlist_folder_idx").on(t.folderId),
  ],
);

export const playlistTrack = pgTable(
  "playlist_track",
  {
    playlistId: integer("playlist_id")
      .notNull()
      .references(() => playlist.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    trackId: integer("track_id")
      .notNull()
      .references(() => track.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.playlistId, t.position] })],
);

/**
 * A per-device password for Subsonic clients, so the account password never
 * leaves the website. Subsonic's token login needs the server to know the
 * secret, so it is kept encrypted (`secretEnc`) as well as hashed for lookup
 * when a client sends it as an API key.
 */
export const appPassword = pgTable(
  "app_password",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    secretHash: text("secret_hash").notNull().unique(),
    secretEnc: text("secret_enc").notNull(),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at"),
    lastUsedIp: text("last_used_ip"),
    lastUsedClient: text("last_used_client"),
  },
  (t) => [index("app_password_user_idx").on(t.userId)],
);

/** Subsonic's saved play queue: one per user, so playback can move between devices. */
export const playQueue = pgTable("play_queue", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  trackIds: jsonb("track_ids").$type<number[]>().notNull(),
  currentId: integer("current_id"),
  positionMs: bigint("position_ms", { mode: "number" }).default(0).notNull(),
  changedBy: text("changed_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// --- Logs. No foreign keys: a log row outlives the user or track it names. ---

const logId = () => bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity();
const at = () => timestamp("at").defaultNow().notNull();

/** Every Subsonic request and every media request from the website. */
export const accessLog = pgTable(
  "access_log",
  {
    id: logId(),
    at: at(),
    userId: text("user_id"),
    /** As the client sent it, so failed logins for unknown names are still visible. */
    username: text("username"),
    api: text("api", { enum: ["subsonic", "web"] }).notNull(),
    endpoint: text("endpoint").notNull(),
    /** The client's own name: Subsonic's `c` parameter, or "Web". */
    client: text("client"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    ok: boolean("ok").notNull(),
    error: text("error"),
    trackId: integer("track_id"),
    durationMs: integer("duration_ms").notNull(),
  },
  (t) => [index("access_log_at_idx").on(t.at), index("access_log_user_idx").on(t.userId, t.at)],
);

/** One row each time someone finishes (or mostly finishes) a track. */
export const playEvent = pgTable(
  "play_event",
  {
    id: logId(),
    at: at(),
    userId: text("user_id").notNull(),
    username: text("username").notNull(),
    trackId: integer("track_id").notNull(),
    // Copied so the log still reads after the track is gone.
    title: text("title").notNull(),
    artistName: text("artist_name").notNull(),
    client: text("client"),
    ip: text("ip"),
  },
  (t) => [index("play_event_at_idx").on(t.at), index("play_event_user_track_idx").on(t.userId, t.trackId)],
);

/** Sign-ins and every change an admin or user makes. `action` is one of src/lib/activity-actions.ts. */
export const activity = pgTable(
  "activity",
  {
    id: logId(),
    at: at(),
    actorId: text("actor_id"),
    actorName: text("actor_name"),
    action: text("action").notNull(),
    /** What it was done to, as a person would name it. */
    target: text("target"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("activity_at_idx").on(t.at)],
);
