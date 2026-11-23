CREATE TABLE "rule_item_audience" (
	"rule_id" integer NOT NULL,
	"kind" text NOT NULL,
	"source_path" text NOT NULL,
	"audience" jsonb NOT NULL,
	CONSTRAINT "rule_item_audience_rule_id_kind_source_path_pk" PRIMARY KEY("rule_id","kind","source_path")
);
--> statement-breakpoint
ALTER TABLE "folder_rule" ADD COLUMN "audience" jsonb;--> statement-breakpoint
ALTER TABLE "playlist" ADD COLUMN "audience" jsonb;--> statement-breakpoint
ALTER TABLE "playlist_folder" ADD COLUMN "audience" jsonb;--> statement-breakpoint
ALTER TABLE "rule_item_audience" ADD CONSTRAINT "rule_item_audience_rule_id_folder_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."folder_rule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Public playlists become ones everyone can listen to, and private ones keep no setting, which means only their owner.
-- Playlists a rule made follow their rule from here on, so only ones people made carry their old setting.
UPDATE "playlist" SET "audience" = '{"kind":"everyone"}'::jsonb WHERE "is_public" AND "rule_id" IS NULL;--> statement-breakpoint
-- A rule's old switch becomes its default for the top of what it makes. Off was a choice (on was the default), so it stays the owner's alone.
UPDATE "folder_rule" SET "audience" = CASE WHEN "is_public" THEN '{"kind":"everyone"}'::jsonb ELSE '{"kind":"owner"}'::jsonb END;--> statement-breakpoint
ALTER TABLE "folder_rule" DROP COLUMN "is_public";--> statement-breakpoint
ALTER TABLE "playlist" DROP COLUMN "is_public";