CREATE TYPE "public"."audit_actor_kind" AS ENUM('USER', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."audit_scope" AS ENUM('SCHOOL', 'PLATFORM');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scope" "audit_scope" NOT NULL,
	"school_id" uuid,
	"actor_kind" "audit_actor_kind" NOT NULL,
	"actor_user_id" uuid,
	"system_actor" text,
	"resource_type" text NOT NULL,
	"resource_id" uuid,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "audit_events_scope_check" CHECK (("audit_events"."scope" = 'SCHOOL' and "audit_events"."school_id" is not null) or ("audit_events"."scope" = 'PLATFORM' and "audit_events"."school_id" is null)),
	CONSTRAINT "audit_events_actor_check" CHECK (("audit_events"."actor_kind" = 'USER' and "audit_events"."actor_user_id" is not null and "audit_events"."system_actor" is null) or ("audit_events"."actor_kind" = 'SYSTEM' and "audit_events"."actor_user_id" is null and "audit_events"."system_actor" is not null and "audit_events"."system_actor" ~ '^[A-Z][A-Z0-9_]{0,63}$')),
	CONSTRAINT "audit_events_action_check" CHECK ("audit_events"."action" ~ '^[A-Z][A-Za-z0-9]{0,95}$'),
	CONSTRAINT "audit_events_resource_check" CHECK ("audit_events"."resource_type" ~ '^[A-Z][A-Za-z0-9]{0,63}$'),
	CONSTRAINT "audit_events_metadata_check" CHECK (jsonb_typeof("audit_events"."metadata") = 'object' and octet_length("audit_events"."metadata"::text) <= 1024)
);
--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_school_actor_fk" FOREIGN KEY ("school_id","actor_user_id") REFERENCES "public"."school_memberships"("school_id","user_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_school_occurred_idx" ON "audit_events" USING btree ("school_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_resource_idx" ON "audit_events" USING btree ("school_id","resource_type","resource_id","occurred_at","id");
--> statement-breakpoint
-- Same deny-by-default Data API boundary as 0015; local plain PostgreSQL may lack API roles.
REVOKE ALL PRIVILEGES ON TABLE public.audit_events FROM PUBLIC;
--> statement-breakpoint
DO $audit_acl$
DECLARE grantee_name text;
BEGIN
  FOR grantee_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.audit_events FROM %I', grantee_name);
  END LOOP;
END
$audit_acl$;
