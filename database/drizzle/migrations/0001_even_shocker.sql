CREATE TYPE "public"."academic_year_status" AS ENUM('PLANNED', 'ACTIVE', 'CLOSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."academic_period_status" AS ENUM('PLANNED', 'ACTIVE', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."level_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."stage_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."track_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."curriculum_status" AS ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."curriculum_subject_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."curriculum_version_status" AS ENUM('DRAFT', 'ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."subject_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."class_status" AS ENUM('ACTIVE', 'CLOSED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "academic_year_status" DEFAULT 'PLANNED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_years_school_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "academic_years_date_range_check" CHECK ("academic_years"."start_date" < "academic_years"."end_date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "academic_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sequence" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "academic_period_status" DEFAULT 'PLANNED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_periods_date_range_check" CHECK ("academic_periods"."start_date" < "academic_periods"."end_date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sequence" integer NOT NULL,
	"status" "level_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "levels_school_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sequence" integer NOT NULL,
	"status" "stage_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stages_school_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sequence" integer NOT NULL,
	"status" "track_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracks_school_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curricula" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "curriculum_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curricula_school_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curriculum_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"curriculum_version_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"coefficient" numeric(4, 2) NOT NULL,
	"display_order" integer,
	"status" "curriculum_subject_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_subjects_coefficient_check" CHECK ("curriculum_subjects"."coefficient" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curriculum_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"curriculum_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "curriculum_version_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_versions_school_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"status" "subject_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_school_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"level_id" uuid NOT NULL,
	"track_id" uuid,
	"curriculum_version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "class_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_school_year_fk" FOREIGN KEY ("school_id","academic_year_id") REFERENCES "public"."academic_years"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "levels" ADD CONSTRAINT "levels_school_stage_fk" FOREIGN KEY ("school_id","stage_id") REFERENCES "public"."stages"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stages" ADD CONSTRAINT "stages_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tracks" ADD CONSTRAINT "tracks_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "curricula" ADD CONSTRAINT "curricula_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "curriculum_subjects" ADD CONSTRAINT "curriculum_subjects_school_version_fk" FOREIGN KEY ("school_id","curriculum_version_id") REFERENCES "public"."curriculum_versions"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "curriculum_subjects" ADD CONSTRAINT "curriculum_subjects_school_subject_fk" FOREIGN KEY ("school_id","subject_id") REFERENCES "public"."subjects"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_school_curriculum_fk" FOREIGN KEY ("school_id","curriculum_id") REFERENCES "public"."curricula"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classes" ADD CONSTRAINT "classes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classes" ADD CONSTRAINT "classes_school_academic_year_fk" FOREIGN KEY ("school_id","academic_year_id") REFERENCES "public"."academic_years"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classes" ADD CONSTRAINT "classes_school_level_fk" FOREIGN KEY ("school_id","level_id") REFERENCES "public"."levels"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classes" ADD CONSTRAINT "classes_school_track_fk" FOREIGN KEY ("school_id","track_id") REFERENCES "public"."tracks"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classes" ADD CONSTRAINT "classes_school_curriculum_version_fk" FOREIGN KEY ("school_id","curriculum_version_id") REFERENCES "public"."curriculum_versions"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "academic_years_school_name_unique" ON "academic_years" USING btree ("school_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "academic_periods_year_sequence_unique" ON "academic_periods" USING btree ("academic_year_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "academic_periods_year_name_unique" ON "academic_periods" USING btree ("academic_year_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "academic_periods_school_year_idx" ON "academic_periods" USING btree ("school_id","academic_year_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "levels_stage_name_unique" ON "levels" USING btree ("stage_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "levels_school_stage_idx" ON "levels" USING btree ("school_id","stage_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stages_school_name_unique" ON "stages" USING btree ("school_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tracks_school_name_unique" ON "tracks" USING btree ("school_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "curricula_school_name_unique" ON "curricula" USING btree ("school_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_subjects_version_subject_unique" ON "curriculum_subjects" USING btree ("curriculum_version_id","subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "curriculum_subjects_school_version_idx" ON "curriculum_subjects" USING btree ("school_id","curriculum_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_versions_curriculum_name_unique" ON "curriculum_versions" USING btree ("curriculum_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "curriculum_versions_school_curriculum_idx" ON "curriculum_versions" USING btree ("school_id","curriculum_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subjects_school_name_unique" ON "subjects" USING btree ("school_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "classes_school_year_name_unique" ON "classes" USING btree ("school_id","academic_year_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "classes_school_year_idx" ON "classes" USING btree ("school_id","academic_year_id");