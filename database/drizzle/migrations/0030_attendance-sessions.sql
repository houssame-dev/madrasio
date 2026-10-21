ALTER TABLE "timetable_publications" ADD CONSTRAINT "timetable_publication_context_id_unique" UNIQUE("school_id","academic_year_id","class_id","id");--> statement-breakpoint
ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_records_school_class_student_date_unique";--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "publication_id" uuid;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "lesson_key" uuid;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "session" jsonb;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_publication_context_fk" FOREIGN KEY ("school_id","academic_year_id","class_id","publication_id") REFERENCES "public"."timetable_publications"("school_id","academic_year_id","class_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_records_legacy_daily_unique" ON "attendance_records" USING btree ("school_id","class_id","student_id","attendance_date") WHERE "attendance_records"."publication_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_records_session_student_unique" ON "attendance_records" USING btree ("school_id","publication_id","lesson_key","attendance_date","student_id") WHERE "attendance_records"."publication_id" is not null;--> statement-breakpoint

ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_check" CHECK (("attendance_records"."publication_id" is null and "attendance_records"."lesson_key" is null and "attendance_records"."session" is null) or ("attendance_records"."publication_id" is not null and "attendance_records"."lesson_key" is not null and "attendance_records"."session" is not null and jsonb_typeof("attendance_records"."session")='object' and coalesce("attendance_records"."session"->>'lessonKey'="attendance_records"."lesson_key"::text,false)));--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_version_check" CHECK ("attendance_records"."version">0);