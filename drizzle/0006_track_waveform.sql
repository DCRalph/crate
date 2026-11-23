CREATE TABLE "track_waveform" (
	"track_id" integer PRIMARY KEY NOT NULL,
	"peaks" text NOT NULL,
	"size" bigint NOT NULL,
	"mtime_ms" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "track_waveform" ADD CONSTRAINT "track_waveform_track_id_track_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."track"("id") ON DELETE cascade ON UPDATE no action;