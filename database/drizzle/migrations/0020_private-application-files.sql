CREATE TABLE IF NOT EXISTS "announcement_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"announcement_version_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_attachments_file_unique" UNIQUE("file_id")
);
--> statement-breakpoint
ALTER TABLE "announcement_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"original_name" text NOT NULL,
	"media_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"object_key" text NOT NULL,
	"state" text DEFAULT 'UPLOADING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_school_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "files_upload_request_unique" UNIQUE("school_id","created_by","request_id"),
	CONSTRAINT "files_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "files_state_check" CHECK ("files"."state" IN ('UPLOADING', 'READY', 'REJECTED')),
	CONSTRAINT "files_size_check" CHECK ("files"."byte_size" > 0 AND "files"."byte_size" <= 2097152),
	CONSTRAINT "files_sha256_check" CHECK ("files"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "files_name_check" CHECK (length("files"."original_name") BETWEEN 1 AND 180 AND "files"."original_name" !~ '[[:cntrl:]/]' AND strpos("files"."original_name", chr(92)) = 0),
	CONSTRAINT "files_media_type_check" CHECK ("files"."media_type" IN ('application/pdf', 'image/png', 'image/jpeg'))
);
--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_attachments" ADD CONSTRAINT "announcement_attachments_school_version_fk" FOREIGN KEY ("school_id","announcement_version_id") REFERENCES "public"."announcement_versions"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_attachments" ADD CONSTRAINT "announcement_attachments_school_file_fk" FOREIGN KEY ("school_id","file_id") REFERENCES "public"."files"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "files" ADD CONSTRAINT "files_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "files" ADD CONSTRAINT "files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcement_attachments_version_idx" ON "announcement_attachments" USING btree ("school_id","announcement_version_id");
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE public.files, public.announcement_attachments FROM PUBLIC;
--> statement-breakpoint
DO $files_acl$
DECLARE grantee_name text;
BEGIN
  FOR grantee_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.files, public.announcement_attachments FROM %I', grantee_name);
  END LOOP;
END
$files_acl$;
