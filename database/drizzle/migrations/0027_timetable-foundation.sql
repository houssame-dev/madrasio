ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignment_timetable_context_unique" UNIQUE("school_id","academic_year_id","class_id","subject_id","id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "timetable_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"stage_id" uuid,
	"level_id" uuid,
	"scope_key" text NOT NULL,
	"revision" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"days" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timetable_config_revision_unique" UNIQUE("school_id","academic_year_id","scope_key","revision"),
	CONSTRAINT "timetable_config_scope_check" CHECK (("timetable_configurations"."stage_id" is null and "timetable_configurations"."level_id" is null and "timetable_configurations"."scope_key"='school') or ("timetable_configurations"."stage_id" is not null and "timetable_configurations"."level_id" is null and "timetable_configurations"."scope_key"='stage:' || "timetable_configurations"."stage_id"::text) or ("timetable_configurations"."level_id" is not null and "timetable_configurations"."stage_id" is null and "timetable_configurations"."scope_key"='level:' || "timetable_configurations"."level_id"::text)),
	CONSTRAINT "timetable_config_revision_check" CHECK ("timetable_configurations"."revision">0),
	CONSTRAINT "timetable_config_days_check" CHECK (jsonb_typeof("timetable_configurations"."days")='array' and jsonb_array_length("timetable_configurations"."days") between 1 and 7)
);
--> statement-breakpoint
ALTER TABLE "timetable_configurations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "timetable_loads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"curriculum_version_id" uuid NOT NULL,
	"teacher_assignment_id" uuid NOT NULL,
	"room_id" uuid,
	"lessons_per_week" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"revision" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timetable_load_revision_unique" UNIQUE("school_id","class_id","subject_id","revision"),
	CONSTRAINT "timetable_load_values_check" CHECK ("timetable_loads"."revision">0 and "timetable_loads"."lessons_per_week" between 1 and 60 and "timetable_loads"."duration_minutes" between 5 and 240)
);
--> statement-breakpoint
ALTER TABLE "timetable_loads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "timetable_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timetable_rooms_school_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "timetable_rooms_name_unique" UNIQUE("school_id","name"),
	CONSTRAINT "timetable_rooms_kind_check" CHECK ("timetable_rooms"."kind" in ('ROOM','LAB')),
	CONSTRAINT "timetable_rooms_revision_check" CHECK ("timetable_rooms"."revision">0),
	CONSTRAINT "timetable_rooms_name_check" CHECK (length(trim("timetable_rooms"."name")) between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "timetable_rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_configurations" ADD CONSTRAINT "timetable_configurations_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_configurations" ADD CONSTRAINT "timetable_configurations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_configurations" ADD CONSTRAINT "timetable_configurations_school_id_academic_year_id_academic_years_school_id_id_fk" FOREIGN KEY ("school_id","academic_year_id") REFERENCES "public"."academic_years"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_configurations" ADD CONSTRAINT "timetable_configurations_school_id_stage_id_stages_school_id_id_fk" FOREIGN KEY ("school_id","stage_id") REFERENCES "public"."stages"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_configurations" ADD CONSTRAINT "timetable_configurations_school_id_level_id_levels_school_id_id_fk" FOREIGN KEY ("school_id","level_id") REFERENCES "public"."levels"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_loads" ADD CONSTRAINT "timetable_loads_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_loads" ADD CONSTRAINT "timetable_loads_teacher_assignment_id_teacher_assignments_id_fk" FOREIGN KEY ("teacher_assignment_id") REFERENCES "public"."teacher_assignments"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_loads" ADD CONSTRAINT "timetable_loads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_loads" ADD CONSTRAINT "timetable_loads_school_id_academic_year_id_class_id_classes_school_id_academic_year_id_id_fk" FOREIGN KEY ("school_id","academic_year_id","class_id") REFERENCES "public"."classes"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_loads" ADD CONSTRAINT "timetable_loads_school_id_subject_id_subjects_school_id_id_fk" FOREIGN KEY ("school_id","subject_id") REFERENCES "public"."subjects"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_loads" ADD CONSTRAINT "timetable_load_assignment_context_fk" FOREIGN KEY ("school_id","academic_year_id","class_id","subject_id","teacher_assignment_id") REFERENCES "public"."teacher_assignments"("school_id","academic_year_id","class_id","subject_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_loads" ADD CONSTRAINT "timetable_loads_school_id_curriculum_version_id_curriculum_versions_school_id_id_fk" FOREIGN KEY ("school_id","curriculum_version_id") REFERENCES "public"."curriculum_versions"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_loads" ADD CONSTRAINT "timetable_loads_school_id_room_id_timetable_rooms_school_id_id_fk" FOREIGN KEY ("school_id","room_id") REFERENCES "public"."timetable_rooms"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_rooms" ADD CONSTRAINT "timetable_rooms_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_rooms" ADD CONSTRAINT "timetable_rooms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_rooms" ADD CONSTRAINT "timetable_rooms_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
REVOKE ALL ON TABLE public.timetable_configurations, public.timetable_rooms, public.timetable_loads FROM PUBLIC;
--> statement-breakpoint
DO $timetable_acl$
DECLARE api_role text; table_name text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    FOREACH table_name IN ARRAY ARRAY['timetable_configurations','timetable_rooms','timetable_loads'] LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',table_name,api_role);
    END LOOP;
  END LOOP;
END
$timetable_acl$;
