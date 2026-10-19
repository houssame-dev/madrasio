ALTER TABLE "timetable_configurations" ADD CONSTRAINT "timetable_config_year_id_unique" UNIQUE("school_id","academic_year_id","id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "timetable_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"academic_period_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"configuration_id" uuid NOT NULL,
	"curriculum_version_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"revision" integer NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timetable_draft_context_revision_unique" UNIQUE("school_id","academic_year_id","academic_period_id","class_id","revision"),
	CONSTRAINT "timetable_draft_request_unique" UNIQUE("school_id","request_key"),
	CONSTRAINT "timetable_draft_class_id_unique" UNIQUE("school_id","academic_year_id","class_id","id"),
	CONSTRAINT "timetable_draft_revision_check" CHECK ("timetable_drafts"."revision">0),
	CONSTRAINT "timetable_draft_dates_check" CHECK ("timetable_drafts"."start_date"<="timetable_drafts"."end_date")
);
--> statement-breakpoint
ALTER TABLE "timetable_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "timetable_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"lesson_key" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"subject_id" uuid NOT NULL,
	"teacher_assignment_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"room_id" uuid,
	CONSTRAINT "timetable_lesson_key_unique" UNIQUE("school_id","draft_id","lesson_key"),
	CONSTRAINT "timetable_lesson_time_check" CHECK ("timetable_lessons"."weekday" between 1 and 7 and "timetable_lessons"."start_minute">=0 and "timetable_lessons"."end_minute"<=1440 and "timetable_lessons"."start_minute"<"timetable_lessons"."end_minute")
);
--> statement-breakpoint
ALTER TABLE "timetable_lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_drafts" ADD CONSTRAINT "timetable_drafts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_drafts" ADD CONSTRAINT "timetable_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_drafts" ADD CONSTRAINT "timetable_draft_class_fk" FOREIGN KEY ("school_id","academic_year_id","class_id") REFERENCES "public"."classes"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_drafts" ADD CONSTRAINT "timetable_draft_period_fk" FOREIGN KEY ("school_id","academic_year_id","academic_period_id") REFERENCES "public"."academic_periods"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_drafts" ADD CONSTRAINT "timetable_draft_configuration_fk" FOREIGN KEY ("school_id","academic_year_id","configuration_id") REFERENCES "public"."timetable_configurations"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_drafts" ADD CONSTRAINT "timetable_draft_curriculum_fk" FOREIGN KEY ("school_id","curriculum_version_id") REFERENCES "public"."curriculum_versions"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_lessons" ADD CONSTRAINT "timetable_lesson_draft_fk" FOREIGN KEY ("school_id","academic_year_id","class_id","draft_id") REFERENCES "public"."timetable_drafts"("school_id","academic_year_id","class_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_lessons" ADD CONSTRAINT "timetable_lesson_assignment_fk" FOREIGN KEY ("school_id","academic_year_id","class_id","subject_id","teacher_assignment_id") REFERENCES "public"."teacher_assignments"("school_id","academic_year_id","class_id","subject_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_lessons" ADD CONSTRAINT "timetable_lesson_subject_fk" FOREIGN KEY ("school_id","subject_id") REFERENCES "public"."subjects"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_lessons" ADD CONSTRAINT "timetable_lesson_teacher_fk" FOREIGN KEY ("school_id","teacher_id") REFERENCES "public"."teachers"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_lessons" ADD CONSTRAINT "timetable_lesson_room_fk" FOREIGN KEY ("school_id","room_id") REFERENCES "public"."timetable_rooms"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
REVOKE ALL ON TABLE public.timetable_drafts, public.timetable_lessons FROM PUBLIC;
--> statement-breakpoint
DO $timetable_draft_acl$
DECLARE api_role text; table_name text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    FOREACH table_name IN ARRAY ARRAY['timetable_drafts','timetable_lessons'] LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',table_name,api_role);
    END LOOP;
  END LOOP;
END
$timetable_draft_acl$;
