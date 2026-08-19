ALTER TABLE "publication_recipient_snapshots" ADD COLUMN "audiences" jsonb;--> statement-breakpoint
UPDATE "publication_recipient_snapshots" SET "audiences" = jsonb_build_array(to_jsonb("audience")) WHERE "audience" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "publication_recipient_snapshots" ALTER COLUMN "audiences" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "publication_recipient_snapshots" DROP COLUMN IF EXISTS "audience";--> statement-breakpoint
ALTER TABLE "publication_recipient_snapshots" ADD CONSTRAINT "publication_recipient_snapshots_audiences_check" CHECK ((
        jsonb_typeof("publication_recipient_snapshots"."audiences") = 'array'
        AND (
          "publication_recipient_snapshots"."audiences" = CAST('["PARENTS"]' AS jsonb)
          OR "publication_recipient_snapshots"."audiences" = CAST('["TEACHERS"]' AS jsonb)
          OR "publication_recipient_snapshots"."audiences" = CAST('["PARENTS","TEACHERS"]' AS jsonb)
          OR "publication_recipient_snapshots"."audiences" = CAST('["TEACHERS","PARENTS"]' AS jsonb)
        )
      ));