CREATE TABLE "track_artist" (
	"track_id" integer NOT NULL,
	"artist_id" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "track_artist_track_id_artist_id_pk" PRIMARY KEY("track_id","artist_id")
);
--> statement-breakpoint
DROP INDEX "album_identity_idx";--> statement-breakpoint
-- Until the next scan reads the tags again, the credit is the one artist each row had.
ALTER TABLE "album" ADD COLUMN "artist_credit" text;--> statement-breakpoint
ALTER TABLE "track" ADD COLUMN "artist_credit" text;--> statement-breakpoint
UPDATE "album" SET "artist_credit" = "artist"."name" FROM "artist" WHERE "artist"."id" = "album"."artist_id";--> statement-breakpoint
UPDATE "track" SET "artist_credit" = "artist"."name" FROM "artist" WHERE "artist"."id" = "track"."artist_id";--> statement-breakpoint
ALTER TABLE "album" ALTER COLUMN "artist_credit" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "track" ALTER COLUMN "artist_credit" SET NOT NULL;--> statement-breakpoint
INSERT INTO "track_artist" ("track_id", "artist_id", "position") SELECT "id", "artist_id", 0 FROM "track";--> statement-breakpoint
ALTER TABLE "track_artist" ADD CONSTRAINT "track_artist_track_id_track_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."track"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_artist" ADD CONSTRAINT "track_artist_artist_id_artist_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "track_artist_artist_idx" ON "track_artist" USING btree ("artist_id");--> statement-breakpoint
CREATE UNIQUE INDEX "album_identity_idx" ON "album" USING btree ("library_id","artist_credit","name");--> statement-breakpoint
-- Makes the next scan read every file again, so joint credits are split into their artists.
UPDATE "track" SET "mtime_ms" = 0;
