CREATE TABLE IF NOT EXISTS "timetable_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"effective_from" date NOT NULL,
	"valid_until" date NOT NULL,
	"snapshot" jsonb NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"published_by" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timetable_publication_sequence_unique" UNIQUE("school_id","class_id","sequence"),
	CONSTRAINT "timetable_publication_date_unique" UNIQUE("school_id","class_id","effective_from"),
	CONSTRAINT "timetable_publication_request_unique" UNIQUE("school_id","request_key"),
	CONSTRAINT "timetable_publication_validity_check" CHECK ("timetable_publications"."sequence">0 and "timetable_publications"."effective_from"<="timetable_publications"."valid_until")
);
--> statement-breakpoint
ALTER TABLE "timetable_publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_publications" ADD CONSTRAINT "timetable_publications_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "timetable_publications" ADD CONSTRAINT "timetable_publication_draft_fk" FOREIGN KEY ("school_id","academic_year_id","class_id","draft_id") REFERENCES "public"."timetable_drafts"("school_id","academic_year_id","class_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
REVOKE ALL ON TABLE public.timetable_publications FROM PUBLIC;
--> statement-breakpoint
DO $acl$ DECLARE r text; BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP EXECUTE format('REVOKE ALL ON TABLE public.timetable_publications FROM %I',r); END LOOP; END $acl$;
