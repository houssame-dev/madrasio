CREATE TYPE "public"."grade_state" AS ENUM('VALID', 'MISSING', 'ABSENT', 'EXCUSED');--> statement-breakpoint
CREATE TYPE "public"."result_status" AS ENUM('CALCULATED', 'FINALIZED');--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_school_gradebook_id_unique" UNIQUE("school_id","gradebook_id","id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"gradebook_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"score" numeric(6, 2),
	"state" "grade_state" DEFAULT 'VALID' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grades_assessment_student_unique" UNIQUE("assessment_id","student_id"),
	CONSTRAINT "grades_state_score_check" CHECK (("grades"."state" = 'VALID' AND "grades"."score" IS NOT NULL) OR ("grades"."state" <> 'VALID' AND "grades"."score" IS NULL)),
	CONSTRAINT "grades_score_nonnegative_check" CHECK ("grades"."score" IS NULL OR "grades"."score" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "annual_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"grading_configuration_version_id" uuid NOT NULL,
	"value" numeric(6, 2) NOT NULL,
	"status" "result_status" DEFAULT 'CALCULATED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annual_results_school_context_unique" UNIQUE("school_id","academic_year_id","class_id","student_id"),
	CONSTRAINT "annual_results_value_nonnegative_check" CHECK ("annual_results"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "period_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"academic_period_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"grading_configuration_version_id" uuid NOT NULL,
	"value" numeric(6, 2) NOT NULL,
	"status" "result_status" DEFAULT 'CALCULATED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "period_results_school_context_unique" UNIQUE("school_id","academic_year_id","academic_period_id","class_id","student_id"),
	CONSTRAINT "period_results_value_nonnegative_check" CHECK ("period_results"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subject_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"academic_period_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"grading_configuration_version_id" uuid NOT NULL,
	"value" numeric(6, 2) NOT NULL,
	"status" "result_status" DEFAULT 'CALCULATED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subject_results_school_context_unique" UNIQUE("school_id","academic_year_id","academic_period_id","class_id","student_id","subject_id"),
	CONSTRAINT "subject_results_value_nonnegative_check" CHECK ("subject_results"."value" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grades" ADD CONSTRAINT "grades_school_gradebook_assessment_fk" FOREIGN KEY ("school_id","gradebook_id","assessment_id") REFERENCES "public"."assessments"("school_id","gradebook_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grades" ADD CONSTRAINT "grades_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "public"."students"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "annual_results" ADD CONSTRAINT "annual_results_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "public"."students"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "annual_results" ADD CONSTRAINT "annual_results_school_academic_year_fk" FOREIGN KEY ("school_id","academic_year_id") REFERENCES "public"."academic_years"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "annual_results" ADD CONSTRAINT "annual_results_school_year_class_fk" FOREIGN KEY ("school_id","academic_year_id","class_id") REFERENCES "public"."classes"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "annual_results" ADD CONSTRAINT "annual_results_school_configuration_version_fk" FOREIGN KEY ("school_id","grading_configuration_version_id") REFERENCES "public"."grading_configuration_versions"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "period_results" ADD CONSTRAINT "period_results_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "public"."students"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "period_results" ADD CONSTRAINT "period_results_school_academic_year_fk" FOREIGN KEY ("school_id","academic_year_id") REFERENCES "public"."academic_years"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "period_results" ADD CONSTRAINT "period_results_school_year_period_fk" FOREIGN KEY ("school_id","academic_year_id","academic_period_id") REFERENCES "public"."academic_periods"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "period_results" ADD CONSTRAINT "period_results_school_year_class_fk" FOREIGN KEY ("school_id","academic_year_id","class_id") REFERENCES "public"."classes"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "period_results" ADD CONSTRAINT "period_results_school_configuration_version_fk" FOREIGN KEY ("school_id","grading_configuration_version_id") REFERENCES "public"."grading_configuration_versions"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_results" ADD CONSTRAINT "subject_results_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "public"."students"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_results" ADD CONSTRAINT "subject_results_school_academic_year_fk" FOREIGN KEY ("school_id","academic_year_id") REFERENCES "public"."academic_years"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_results" ADD CONSTRAINT "subject_results_school_year_period_fk" FOREIGN KEY ("school_id","academic_year_id","academic_period_id") REFERENCES "public"."academic_periods"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_results" ADD CONSTRAINT "subject_results_school_year_class_fk" FOREIGN KEY ("school_id","academic_year_id","class_id") REFERENCES "public"."classes"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_results" ADD CONSTRAINT "subject_results_school_subject_fk" FOREIGN KEY ("school_id","subject_id") REFERENCES "public"."subjects"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_results" ADD CONSTRAINT "subject_results_school_configuration_version_fk" FOREIGN KEY ("school_id","grading_configuration_version_id") REFERENCES "public"."grading_configuration_versions"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grades_school_student_idx" ON "grades" USING btree ("school_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grades_school_assessment_idx" ON "grades" USING btree ("school_id","assessment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "annual_results_school_student_idx" ON "annual_results" USING btree ("school_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "annual_results_school_class_idx" ON "annual_results" USING btree ("school_id","class_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "period_results_school_student_idx" ON "period_results" USING btree ("school_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "period_results_school_class_idx" ON "period_results" USING btree ("school_id","class_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subject_results_school_student_idx" ON "subject_results" USING btree ("school_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subject_results_school_class_idx" ON "subject_results" USING btree ("school_id","class_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subject_results_school_subject_idx" ON "subject_results" USING btree ("school_id","subject_id");
