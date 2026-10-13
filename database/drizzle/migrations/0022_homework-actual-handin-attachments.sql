CREATE TABLE IF NOT EXISTS "homework_submission_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"submission_recorded_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homework_attachments_file_unique" UNIQUE("file_id")
);
--> statement-breakpoint
ALTER TABLE "homework_submission_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD COLUMN "actual_handed_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_school_id_unique" UNIQUE("school_id","id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_submission_attachments" ADD CONSTRAINT "homework_attachments_school_submission_fk" FOREIGN KEY ("school_id","submission_id") REFERENCES "public"."homework_submissions"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "homework_submission_attachments" ADD CONSTRAINT "homework_attachments_school_file_fk" FOREIGN KEY ("school_id","file_id") REFERENCES "public"."files"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "homework_attachments_submission_idx" ON "homework_submission_attachments" USING btree ("school_id","submission_id");
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE public.homework_submission_attachments FROM PUBLIC;
--> statement-breakpoint
DO $homework_files_acl$
DECLARE grantee_name text;
BEGIN
  FOR grantee_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.homework_submission_attachments FROM %I', grantee_name);
  END LOOP;
END
$homework_files_acl$;
