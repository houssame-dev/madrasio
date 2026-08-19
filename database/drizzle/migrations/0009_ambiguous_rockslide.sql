CREATE TYPE "public"."homework_status" AS ENUM('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."homework_submission_status" AS ENUM('SUBMITTED', 'LATE', 'REVIEWED', 'RETURNED');--> statement-breakpoint
CREATE TYPE "public"."homework_target_type" AS ENUM('CLASS');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "homework" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"academic_period_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" date NOT NULL,
	"status" "homework_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homework_school_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "homework_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"homework_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content" text,
	"status" "homework_submission_status" DEFAULT 'SUBMITTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homework_submissions_school_homework_student_unique" UNIQUE("school_id","homework_id","student_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "homework_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"homework_id" uuid NOT NULL,
	"target_type" "homework_target_type" DEFAULT 'CLASS' NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homework_targets_school_homework_class_unique" UNIQUE("school_id","homework_id","class_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework" ADD CONSTRAINT "homework_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework" ADD CONSTRAINT "homework_school_teacher_fk" FOREIGN KEY ("school_id","teacher_id") REFERENCES "public"."teachers"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework" ADD CONSTRAINT "homework_school_subject_fk" FOREIGN KEY ("school_id","subject_id") REFERENCES "public"."subjects"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework" ADD CONSTRAINT "homework_school_academic_year_fk" FOREIGN KEY ("school_id","academic_year_id") REFERENCES "public"."academic_years"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework" ADD CONSTRAINT "homework_school_year_period_fk" FOREIGN KEY ("school_id","academic_year_id","academic_period_id") REFERENCES "public"."academic_periods"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_school_homework_fk" FOREIGN KEY ("school_id","homework_id") REFERENCES "public"."homework"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "public"."students"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_targets" ADD CONSTRAINT "homework_targets_school_homework_fk" FOREIGN KEY ("school_id","homework_id") REFERENCES "public"."homework"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_targets" ADD CONSTRAINT "homework_targets_school_year_class_fk" FOREIGN KEY ("school_id","academic_year_id","class_id") REFERENCES "public"."classes"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_school_status_idx" ON "homework" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_school_teacher_idx" ON "homework" USING btree ("school_id","teacher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_school_subject_idx" ON "homework" USING btree ("school_id","subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_school_year_period_idx" ON "homework" USING btree ("school_id","academic_year_id","academic_period_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_school_due_date_idx" ON "homework" USING btree ("school_id","due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_submissions_school_student_idx" ON "homework_submissions" USING btree ("school_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_submissions_school_status_idx" ON "homework_submissions" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_targets_school_class_idx" ON "homework_targets" USING btree ("school_id","class_id");