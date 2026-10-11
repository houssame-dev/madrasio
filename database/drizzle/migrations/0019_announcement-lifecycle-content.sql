ALTER TYPE "public"."announcement_publication_status" ADD VALUE 'CANCELLED';--> statement-breakpoint
ALTER TABLE "announcement_publications" DROP CONSTRAINT "announcement_publications_status_timestamps_check";--> statement-breakpoint
ALTER TABLE "announcement_versions" ADD COLUMN "body_format" text DEFAULT 'PLAIN_TEXT' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcement_publications" ADD CONSTRAINT "announcement_publications_status_timestamps_check" CHECK ((
        ("announcement_publications"."status" = 'PUBLISHED' AND "announcement_publications"."published_at" IS NOT NULL) OR
        ("announcement_publications"."status"::text IN ('SCHEDULED', 'CANCELLED') AND "announcement_publications"."published_at" IS NULL AND "announcement_publications"."scheduled_at" IS NOT NULL)
      ));--> statement-breakpoint
ALTER TABLE "announcement_versions" ADD CONSTRAINT "announcement_versions_body_format_check" CHECK ("announcement_versions"."body_format" IN ('PLAIN_TEXT', 'HTML'));