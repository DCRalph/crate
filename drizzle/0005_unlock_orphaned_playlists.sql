-- Playlists that outlived the folder rule that made them were left read-only, so nobody could edit or delete them.
-- They become ordinary playlists their owner can keep or remove. Removing a library now takes its rules' playlists with it.
UPDATE "playlist" SET "read_only" = false WHERE "rule_id" IS NULL AND "read_only";
