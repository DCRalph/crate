ALTER TABLE "library" ADD COLUMN "source_type" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "library" ADD COLUMN "source_config" jsonb;