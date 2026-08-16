CREATE TYPE "public"."student_status" AS ENUM('ACTIVE', 'INACTIVE', 'WITHDRAWN', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."teacher_status" AS ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."parent_status" AS ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."student_enrollment_status" AS ENUM('ACTIVE', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."teacher_assignment_status" AS ENUM('ACTIVE', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."parent_student_status" AS ENUM('ACTIVE', 'ENDED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"student_code" text,
	"status" "student_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_school_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"user_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"teacher_code" text,
	"status" "teacher_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teachers_school_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"user_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"parent_code" text,
	"status" "parent_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parents_school_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"status" "student_enrollment_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_enrollments_effective_range_check" CHECK ("student_enrollments"."effective_until" IS NULL OR "student_enrollments"."effective_until" >= "student_enrollments"."effective_from")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teacher_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"status" "teacher_assignment_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_assignments_effective_range_check" CHECK ("teacher_assignments"."effective_until" IS NULL OR "teacher_assignments"."effective_until" >= "teacher_assignments"."effective_from")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"parent_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "parent_student_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_school_year_id_unique" UNIQUE("school_id","academic_year_id","id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teachers" ADD CONSTRAINT "teachers_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "parents" ADD CONSTRAINT "parents_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "parents" ADD CONSTRAINT "parents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "public"."students"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_school_academic_year_fk" FOREIGN KEY ("school_id","academic_year_id") REFERENCES "public"."academic_years"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_school_year_class_fk" FOREIGN KEY ("school_id","academic_year_id","class_id") REFERENCES "public"."classes"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_school_teacher_fk" FOREIGN KEY ("school_id","teacher_id") REFERENCES "public"."teachers"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_school_subject_fk" FOREIGN KEY ("school_id","subject_id") REFERENCES "public"."subjects"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_school_academic_year_fk" FOREIGN KEY ("school_id","academic_year_id") REFERENCES "public"."academic_years"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_school_year_class_fk" FOREIGN KEY ("school_id","academic_year_id","class_id") REFERENCES "public"."classes"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "parent_students" ADD CONSTRAINT "parent_students_school_parent_fk" FOREIGN KEY ("school_id","parent_id") REFERENCES "public"."parents"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "parent_students" ADD CONSTRAINT "parent_students_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "public"."students"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "students_school_code_unique" ON "students" USING btree ("school_id","student_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_school_status_idx" ON "students" USING btree ("school_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teachers_school_code_unique" ON "teachers" USING btree ("school_id","teacher_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teachers_school_status_idx" ON "teachers" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teachers_user_idx" ON "teachers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "parents_school_code_unique" ON "parents" USING btree ("school_id","parent_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parents_school_status_idx" ON "parents" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parents_user_idx" ON "parents" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_enrollments_school_student_year_active_unique" ON "student_enrollments" USING btree ("school_id","student_id","academic_year_id") WHERE "student_enrollments"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_enrollments_school_year_idx" ON "student_enrollments" USING btree ("school_id","academic_year_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_enrollments_school_student_idx" ON "student_enrollments" USING btree ("school_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_enrollments_school_class_idx" ON "student_enrollments" USING btree ("school_id","class_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teacher_assignments_school_context_active_unique" ON "teacher_assignments" USING btree ("school_id","teacher_id","class_id","subject_id","academic_year_id") WHERE "teacher_assignments"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_assignments_school_year_idx" ON "teacher_assignments" USING btree ("school_id","academic_year_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_assignments_school_teacher_idx" ON "teacher_assignments" USING btree ("school_id","teacher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_assignments_school_class_idx" ON "teacher_assignments" USING btree ("school_id","class_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_assignments_school_subject_idx" ON "teacher_assignments" USING btree ("school_id","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "parent_students_school_pair_active_unique" ON "parent_students" USING btree ("school_id","parent_id","student_id") WHERE "parent_students"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_students_school_parent_idx" ON "parent_students" USING btree ("school_id","parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parent_students_school_student_idx" ON "parent_students" USING btree ("school_id","student_id");