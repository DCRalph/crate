ALTER TABLE "track_waveform" ADD COLUMN "failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "track_waveform" ADD COLUMN "failed_at" timestamp;