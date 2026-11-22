CREATE TABLE "playlist_folder" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "playlist_folder_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"parent_id" integer,
	"rule_id" integer,
	"source_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "folder_rule" ALTER COLUMN "sync" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "folder_rule" ADD COLUMN "parent_folder_id" integer;--> statement-breakpoint
ALTER TABLE "playlist" ADD COLUMN "folder_id" integer;--> statement-breakpoint
ALTER TABLE "track" ADD COLUMN "track_gain" real;--> statement-breakpoint
ALTER TABLE "track" ADD COLUMN "album_gain" real;--> statement-breakpoint
ALTER TABLE "track" ADD COLUMN "track_peak" real;--> statement-breakpoint
ALTER TABLE "track" ADD COLUMN "album_peak" real;--> statement-breakpoint
ALTER TABLE "playlist_folder" ADD CONSTRAINT "playlist_folder_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_folder" ADD CONSTRAINT "playlist_folder_parent_id_playlist_folder_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."playlist_folder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_folder" ADD CONSTRAINT "playlist_folder_rule_id_folder_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."folder_rule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "playlist_folder_source_idx" ON "playlist_folder" USING btree ("rule_id","source_path");--> statement-breakpoint
CREATE INDEX "playlist_folder_owner_idx" ON "playlist_folder" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "playlist_folder_parent_idx" ON "playlist_folder" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "folder_rule" ADD CONSTRAINT "folder_rule_parent_folder_id_playlist_folder_id_fk" FOREIGN KEY ("parent_folder_id") REFERENCES "public"."playlist_folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist" ADD CONSTRAINT "playlist_folder_id_playlist_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."playlist_folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "playlist_folder_idx" ON "playlist" USING btree ("folder_id");--> statement-breakpoint
-- Folder rules now always follow the disk. Playlists that were seeded once become ordinary playlists.
UPDATE "playlist" SET "rule_id" = NULL, "source_path" = NULL WHERE "rule_id" IN (SELECT "id" FROM "folder_rule" WHERE "sync" = 'seed');--> statement-breakpoint
DELETE FROM "folder_rule" WHERE "sync" = 'seed';--> statement-breakpoint
UPDATE "folder_rule" SET "mode" = 'tree' WHERE "mode" IN ('subfolders', 'leaves');--> statement-breakpoint
-- Makes the next scan read every file again, so ReplayGain tags are picked up.
UPDATE "track" SET "mtime_ms" = 0;
