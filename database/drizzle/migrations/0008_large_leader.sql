CREATE TYPE "public"."attendance_status" AS ENUM('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"attendance_date" date NOT NULL,
	"status" "attendance_status" DEFAULT 'PRESENT' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_records_school_class_student_date_unique" UNIQUE("school_id","class_id","student_id","attendance_date")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "public"."students"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_school_academic_year_fk" FOREIGN KEY ("school_id","academic_year_id") REFERENCES "public"."academic_years"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_school_year_class_fk" FOREIGN KEY ("school_id","academic_year_id","class_id") REFERENCES "public"."classes"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_records_school_date_idx" ON "attendance_records" USING btree ("school_id","attendance_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_records_school_student_idx" ON "attendance_records" USING btree ("school_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_records_school_class_date_idx" ON "attendance_records" USING btree ("school_id","class_id","attendance_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_records_school_student_date_idx" ON "attendance_records" USING btree ("school_id","student_id","attendance_date");