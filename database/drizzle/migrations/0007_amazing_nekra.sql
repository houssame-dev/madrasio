CREATE TYPE "public"."result_type" AS ENUM('SUBJECT', 'PERIOD', 'ANNUAL');--> statement-breakpoint
CREATE TYPE "public"."outbox_event_status" AS ENUM('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "result_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"result_type" "result_type" NOT NULL,
	"subject_result_id" uuid,
	"period_result_id" uuid,
	"annual_result_id" uuid,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"academic_period_id" uuid,
	"class_id" uuid NOT NULL,
	"result_value" numeric(6, 2) NOT NULL,
	"grading_configuration_version_id" uuid NOT NULL,
	"publication_version" integer NOT NULL,
	"published_by" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_publications_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "result_publications_result_type_check" CHECK ((
        ("result_publications"."result_type" = 'SUBJECT' AND "result_publications"."subject_result_id" IS NOT NULL AND "result_publications"."period_result_id" IS NULL AND "result_publications"."annual_result_id" IS NULL) OR
        ("result_publications"."result_type" = 'PERIOD' AND "result_publications"."period_result_id" IS NOT NULL AND "result_publications"."subject_result_id" IS NULL AND "result_publications"."annual_result_id" IS NULL) OR
        ("result_publications"."result_type" = 'ANNUAL' AND "result_publications"."annual_result_id" IS NOT NULL AND "result_publications"."subject_result_id" IS NULL AND "result_publications"."period_result_id" IS NULL)
      )),
	CONSTRAINT "result_publications_period_column_check" CHECK ((
        ("result_publications"."result_type" = 'ANNUAL' AND "result_publications"."academic_period_id" IS NULL) OR
        ("result_publications"."result_type" <> 'ANNUAL' AND "result_publications"."academic_period_id" IS NOT NULL)
      )),
	CONSTRAINT "result_publications_version_positive_check" CHECK ("result_publications"."publication_version" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_event_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_payload_object_check" CHECK (jsonb_typeof("outbox_events"."payload") = 'object')
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "annual_results" ADD CONSTRAINT "annual_results_school_id_unique" UNIQUE("school_id","id");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "period_results" ADD CONSTRAINT "period_results_school_id_unique" UNIQUE("school_id","id");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_results" ADD CONSTRAINT "subject_results_school_id_unique" UNIQUE("school_id","id");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "public"."students"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_school_academic_year_fk" FOREIGN KEY ("school_id","academic_year_id") REFERENCES "public"."academic_years"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_school_year_period_fk" FOREIGN KEY ("school_id","academic_year_id","academic_period_id") REFERENCES "public"."academic_periods"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_school_year_class_fk" FOREIGN KEY ("school_id","academic_year_id","class_id") REFERENCES "public"."classes"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_school_subject_result_fk" FOREIGN KEY ("school_id","subject_result_id") REFERENCES "public"."subject_results"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_school_period_result_fk" FOREIGN KEY ("school_id","period_result_id") REFERENCES "public"."period_results"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_school_annual_result_fk" FOREIGN KEY ("school_id","annual_result_id") REFERENCES "public"."annual_results"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_school_configuration_version_fk" FOREIGN KEY ("school_id","grading_configuration_version_id") REFERENCES "public"."grading_configuration_versions"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "result_publications_subject_version_unique" ON "result_publications" USING btree ("subject_result_id","publication_version") WHERE "result_publications"."subject_result_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "result_publications_period_version_unique" ON "result_publications" USING btree ("period_result_id","publication_version") WHERE "result_publications"."period_result_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "result_publications_annual_version_unique" ON "result_publications" USING btree ("annual_result_id","publication_version") WHERE "result_publications"."annual_result_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "result_publications_school_student_idx" ON "result_publications" USING btree ("school_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "result_publications_school_subject_result_idx" ON "result_publications" USING btree ("school_id","subject_result_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "result_publications_school_period_result_idx" ON "result_publications" USING btree ("school_id","period_result_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "result_publications_school_annual_result_idx" ON "result_publications" USING btree ("school_id","annual_result_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_events_status_created_idx" ON "outbox_events" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_events_type_idx" ON "outbox_events" USING btree ("event_type");