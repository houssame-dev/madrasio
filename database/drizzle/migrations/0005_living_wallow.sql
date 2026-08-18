CREATE TYPE "public"."gradebook_status" AS ENUM('DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."assessment_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."assessment_type" AS ENUM('QUIZ', 'TEST', 'EXAM', 'ORAL', 'PROJECT', 'HOMEWORK');--> statement-breakpoint
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_school_year_id_unique" UNIQUE("school_id","academic_year_id","id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gradebooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"academic_period_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"grading_configuration_version_id" uuid NOT NULL,
	"name" text,
	"status" "gradebook_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gradebooks_school_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"gradebook_id" uuid NOT NULL,
	"title" text NOT NULL,
	"assessment_type" "assessment_type" NOT NULL,
	"maximum_score" numeric(6, 2) NOT NULL,
	"weight" numeric(6, 2) DEFAULT '1' NOT NULL,
	"status" "assessment_status" DEFAULT 'DRAFT' NOT NULL,
	"assessment_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessments_school_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "assessments_maximum_score_check" CHECK ("assessments"."maximum_score" > 0),
	CONSTRAINT "assessments_weight_check" CHECK ("assessments"."weight" > 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gradebooks" ADD CONSTRAINT "gradebooks_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gradebooks" ADD CONSTRAINT "gradebooks_school_academic_year_fk" FOREIGN KEY ("school_id","academic_year_id") REFERENCES "public"."academic_years"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gradebooks" ADD CONSTRAINT "gradebooks_school_period_fk" FOREIGN KEY ("school_id","academic_year_id","academic_period_id") REFERENCES "public"."academic_periods"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gradebooks" ADD CONSTRAINT "gradebooks_school_class_fk" FOREIGN KEY ("school_id","academic_year_id","class_id") REFERENCES "public"."classes"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gradebooks" ADD CONSTRAINT "gradebooks_school_subject_fk" FOREIGN KEY ("school_id","subject_id") REFERENCES "public"."subjects"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gradebooks" ADD CONSTRAINT "gradebooks_school_configuration_version_fk" FOREIGN KEY ("school_id","grading_configuration_version_id") REFERENCES "public"."grading_configuration_versions"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessments" ADD CONSTRAINT "assessments_school_gradebook_fk" FOREIGN KEY ("school_id","gradebook_id") REFERENCES "public"."gradebooks"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gradebooks_school_context_unique" ON "gradebooks" USING btree ("school_id","academic_year_id","academic_period_id","class_id","subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gradebooks_school_class_subject_idx" ON "gradebooks" USING btree ("school_id","class_id","subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gradebooks_school_subject_idx" ON "gradebooks" USING btree ("school_id","subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessments_gradebook_idx" ON "assessments" USING btree ("gradebook_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessments_school_date_idx" ON "assessments" USING btree ("school_id","assessment_date");