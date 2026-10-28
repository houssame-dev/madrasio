CREATE TYPE "public"."school_holiday_type" AS ENUM('PUBLIC_HOLIDAY', 'SCHOOL_HOLIDAY');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "school_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "school_holiday_type" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"description" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "school_holidays_dates_check" CHECK ("school_holidays"."start_date" <= "school_holidays"."end_date"),
	CONSTRAINT "school_holidays_name_check" CHECK (length(btrim("school_holidays"."name")) between 1 and 160),
	CONSTRAINT "school_holidays_description_check" CHECK ("school_holidays"."description" is null or length("school_holidays"."description") <= 2000),
	CONSTRAINT "school_holidays_revision_check" CHECK ("school_holidays"."revision" > 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "school_holidays" ADD CONSTRAINT "school_holidays_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "school_holidays" ADD CONSTRAINT "school_holidays_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "school_holidays" ADD CONSTRAINT "school_holidays_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "school_holidays_school_range_idx" ON "school_holidays" USING btree ("school_id","start_date","end_date") WHERE "school_holidays"."removed_at" is null;
--> statement-breakpoint
ALTER TABLE public.school_holidays ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE public.school_holidays FROM PUBLIC;
--> statement-breakpoint
DO $acl$ DECLARE r text; BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP EXECUTE format('REVOKE ALL ON TABLE public.school_holidays FROM %I',r); END LOOP; END $acl$;
