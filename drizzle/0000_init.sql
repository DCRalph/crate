CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"username" text,
	"display_username" text,
	"max_bit_rate" integer,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "access_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp DEFAULT now() NOT NULL,
	"user_id" text,
	"username" text,
	"api" text NOT NULL,
	"endpoint" text NOT NULL,
	"client" text,
	"ip" text,
	"user_agent" text,
	"ok" boolean NOT NULL,
	"error" text,
	"track_id" integer,
	"duration_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp DEFAULT now() NOT NULL,
	"actor_id" text,
	"actor_name" text,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "album" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "album_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"library_id" integer NOT NULL,
	"artist_id" integer NOT NULL,
	"name" text NOT NULL,
	"year" integer,
	"genre" text,
	"cover_path" text,
	"track_count" integer DEFAULT 0 NOT NULL,
	"duration" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "annotation" (
	"user_id" text NOT NULL,
	"item_type" text NOT NULL,
	"item_id" integer NOT NULL,
	"starred_at" timestamp,
	"rating" integer,
	CONSTRAINT "annotation_user_id_item_type_item_id_pk" PRIMARY KEY("user_id","item_type","item_id")
);
--> statement-breakpoint
CREATE TABLE "app_password" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app_password_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"secret_hash" text NOT NULL,
	"secret_enc" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"last_used_ip" text,
	"last_used_client" text,
	CONSTRAINT "app_password_secret_hash_unique" UNIQUE("secret_hash")
);
--> statement-breakpoint
CREATE TABLE "artist" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "artist_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artist_name_key_unique" UNIQUE("name_key")
);
--> statement-breakpoint
CREATE TABLE "folder_rule" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "folder_rule_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"library_id" integer NOT NULL,
	"path" text NOT NULL,
	"mode" text NOT NULL,
	"sync" text NOT NULL,
	"owner_id" text NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "library_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_scan_at" timestamp,
	"last_scan" jsonb,
	CONSTRAINT "library_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "library_access" (
	"user_id" text NOT NULL,
	"library_id" integer NOT NULL,
	"can_download" boolean DEFAULT false NOT NULL,
	CONSTRAINT "library_access_user_id_library_id_pk" PRIMARY KEY("user_id","library_id")
);
--> statement-breakpoint
CREATE TABLE "play_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "play_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"track_id" integer NOT NULL,
	"title" text NOT NULL,
	"artist_name" text NOT NULL,
	"client" text,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "play_queue" (
	"user_id" text PRIMARY KEY NOT NULL,
	"track_ids" jsonb NOT NULL,
	"current_id" integer,
	"position_ms" bigint DEFAULT 0 NOT NULL,
	"changed_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "playlist_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"comment" text,
	"rule_id" integer,
	"source_path" text,
	"read_only" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist_track" (
	"playlist_id" integer NOT NULL,
	"position" integer NOT NULL,
	"track_id" integer NOT NULL,
	CONSTRAINT "playlist_track_playlist_id_position_pk" PRIMARY KEY("playlist_id","position")
);
--> statement-breakpoint
CREATE TABLE "track" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "track_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"library_id" integer NOT NULL,
	"album_id" integer NOT NULL,
	"artist_id" integer NOT NULL,
	"title" text NOT NULL,
	"track_number" integer,
	"disc_number" integer,
	"year" integer,
	"genre" text,
	"duration" integer DEFAULT 0 NOT NULL,
	"bit_rate" integer,
	"size" bigint NOT NULL,
	"suffix" text NOT NULL,
	"content_type" text NOT NULL,
	"path" text NOT NULL,
	"rel_path" text NOT NULL,
	"mtime_ms" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "track_path_unique" UNIQUE("path")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album" ADD CONSTRAINT "album_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album" ADD CONSTRAINT "album_artist_id_artist_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation" ADD CONSTRAINT "annotation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_password" ADD CONSTRAINT "app_password_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_rule" ADD CONSTRAINT "folder_rule_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_rule" ADD CONSTRAINT "folder_rule_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_access" ADD CONSTRAINT "library_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_access" ADD CONSTRAINT "library_access_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_queue" ADD CONSTRAINT "play_queue_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist" ADD CONSTRAINT "playlist_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist" ADD CONSTRAINT "playlist_rule_id_folder_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."folder_rule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_track" ADD CONSTRAINT "playlist_track_playlist_id_playlist_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_track" ADD CONSTRAINT "playlist_track_track_id_track_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."track"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track" ADD CONSTRAINT "track_library_id_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track" ADD CONSTRAINT "track_album_id_album_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."album"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track" ADD CONSTRAINT "track_artist_id_artist_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "access_log_at_idx" ON "access_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "access_log_user_idx" ON "access_log" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "activity_at_idx" ON "activity" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "album_identity_idx" ON "album" USING btree ("library_id","artist_id","name");--> statement-breakpoint
CREATE INDEX "album_artist_idx" ON "album" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "app_password_user_idx" ON "app_password" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "play_event_at_idx" ON "play_event" USING btree ("at");--> statement-breakpoint
CREATE INDEX "play_event_user_track_idx" ON "play_event" USING btree ("user_id","track_id");--> statement-breakpoint
CREATE UNIQUE INDEX "playlist_source_idx" ON "playlist" USING btree ("rule_id","source_path");--> statement-breakpoint
CREATE INDEX "playlist_owner_idx" ON "playlist" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "track_album_idx" ON "track" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "track_artist_idx" ON "track" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "track_library_idx" ON "track" USING btree ("library_id","rel_path");--> statement-breakpoint
CREATE INDEX "track_genre_idx" ON "track" USING btree ("genre");