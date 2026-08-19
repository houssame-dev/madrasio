CREATE TYPE "public"."announcement_audience" AS ENUM('PARENTS', 'TEACHERS');--> statement-breakpoint
CREATE TYPE "public"."announcement_publication_status" AS ENUM('SCHEDULED', 'PUBLISHED');--> statement-breakpoint
CREATE TYPE "public"."announcement_status" AS ENUM('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."announcement_target_type" AS ENUM('SCHOOL', 'CLASS');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcement_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"announcement_id" uuid NOT NULL,
	"announcement_version_id" uuid NOT NULL,
	"publication_version" integer NOT NULL,
	"status" "announcement_publication_status" DEFAULT 'SCHEDULED' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"published_by" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_publications_school_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "announcement_publications_announcement_version_unique" UNIQUE("announcement_id","publication_version"),
	CONSTRAINT "announcement_publications_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "announcement_publications_version_positive_check" CHECK ("announcement_publications"."publication_version" > 0),
	CONSTRAINT "announcement_publications_status_timestamps_check" CHECK ((
        ("announcement_publications"."status" = 'PUBLISHED' AND "announcement_publications"."published_at" IS NOT NULL) OR
        ("announcement_publications"."status" = 'SCHEDULED' AND "announcement_publications"."published_at" IS NULL AND "announcement_publications"."scheduled_at" IS NOT NULL)
      )),
	CONSTRAINT "announcement_publications_schedule_order_check" CHECK ("announcement_publications"."scheduled_at" IS NULL OR "announcement_publications"."published_at" IS NULL OR "announcement_publications"."scheduled_at" <= "announcement_publications"."published_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcement_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"announcement_version_id" uuid NOT NULL,
	"audience" "announcement_audience" NOT NULL,
	"target_type" "announcement_target_type" NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"class_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_targets_type_class_check" CHECK ((
        ("announcement_targets"."target_type" = 'CLASS' AND "announcement_targets"."class_id" IS NOT NULL) OR
        ("announcement_targets"."target_type" = 'SCHOOL' AND "announcement_targets"."class_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcement_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"announcement_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_versions_school_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "announcement_versions_announcement_version_unique" UNIQUE("announcement_id","version_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"status" "announcement_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_school_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publication_recipient_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"audience" "announcement_audience" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_recipient_snapshots_publication_recipient_unique" UNIQUE("publication_id","recipient_user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_publications" ADD CONSTRAINT "announcement_publications_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_publications" ADD CONSTRAINT "announcement_publications_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_publications" ADD CONSTRAINT "announcement_publications_school_announcement_fk" FOREIGN KEY ("school_id","announcement_id") REFERENCES "public"."announcements"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_publications" ADD CONSTRAINT "announcement_publications_school_version_fk" FOREIGN KEY ("school_id","announcement_version_id") REFERENCES "public"."announcement_versions"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_school_version_fk" FOREIGN KEY ("school_id","announcement_version_id") REFERENCES "public"."announcement_versions"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_school_year_class_fk" FOREIGN KEY ("school_id","academic_year_id","class_id") REFERENCES "public"."classes"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_versions" ADD CONSTRAINT "announcement_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_versions" ADD CONSTRAINT "announcement_versions_school_announcement_fk" FOREIGN KEY ("school_id","announcement_id") REFERENCES "public"."announcements"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcements" ADD CONSTRAINT "announcements_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publication_recipient_snapshots" ADD CONSTRAINT "publication_recipient_snapshots_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publication_recipient_snapshots" ADD CONSTRAINT "publication_recipient_snapshots_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "publication_recipient_snapshots" ADD CONSTRAINT "publication_recipient_snapshots_school_publication_fk" FOREIGN KEY ("school_id","publication_id") REFERENCES "public"."announcement_publications"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcement_publications_school_version_idx" ON "announcement_publications" USING btree ("school_id","announcement_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcement_publications_school_announcement_idx" ON "announcement_publications" USING btree ("school_id","announcement_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcement_publications_school_scheduled_at_idx" ON "announcement_publications" USING btree ("school_id","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_targets_class_unique" ON "announcement_targets" USING btree ("school_id","announcement_version_id","audience","target_type","class_id") WHERE "announcement_targets"."class_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_targets_school_unique" ON "announcement_targets" USING btree ("school_id","announcement_version_id","audience","target_type") WHERE "announcement_targets"."target_type" = 'SCHOOL';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcement_targets_school_class_idx" ON "announcement_targets" USING btree ("school_id","class_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcement_versions_announcement_idx" ON "announcement_versions" USING btree ("school_id","announcement_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcements_school_status_idx" ON "announcements" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcements_school_created_by_idx" ON "announcements" USING btree ("school_id","created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publication_recipient_snapshots_school_recipient_idx" ON "publication_recipient_snapshots" USING btree ("school_id","recipient_user_id");