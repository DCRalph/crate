CREATE TABLE "playlist_pin" (
	"user_id" text NOT NULL,
	"playlist_id" integer NOT NULL,
	"pinned_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "playlist_pin_user_id_playlist_id_pk" PRIMARY KEY("user_id","playlist_id")
);
--> statement-breakpoint
ALTER TABLE "playlist" ADD COLUMN "cover_seed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "playlist" ADD COLUMN "cover_album_id" integer;--> statement-breakpoint
ALTER TABLE "playlist" ADD COLUMN "cover_upload" text;--> statement-breakpoint
ALTER TABLE "playlist_pin" ADD CONSTRAINT "playlist_pin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_pin" ADD CONSTRAINT "playlist_pin_playlist_id_playlist_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist" ADD CONSTRAINT "playlist_cover_album_id_album_id_fk" FOREIGN KEY ("cover_album_id") REFERENCES "public"."album"("id") ON DELETE set null ON UPDATE no action;