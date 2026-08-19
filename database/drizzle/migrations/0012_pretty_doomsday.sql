CREATE TYPE "public"."notification_source_type" AS ENUM('ANNOUNCEMENT_PUBLICATION', 'RESULT_PUBLICATION');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('ANNOUNCEMENT_PUBLISHED', 'RESULT_PUBLISHED', 'RESULT_REVISED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"notification_type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"source_event_id" uuid NOT NULL,
	"source_type" "notification_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_source_event_recipient_unique" UNIQUE("source_event_id","recipient_user_id"),
	CONSTRAINT "notifications_type_source_check" CHECK ((
        ("notifications"."notification_type" = 'ANNOUNCEMENT_PUBLISHED' AND "notifications"."source_type" = 'ANNOUNCEMENT_PUBLICATION') OR
        ("notifications"."notification_type" IN ('RESULT_PUBLISHED', 'RESULT_REVISED') AND "notifications"."source_type" = 'RESULT_PUBLICATION')
      ))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_school_membership_fk" FOREIGN KEY ("school_id","recipient_user_id") REFERENCES "public"."school_memberships"("school_id","user_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_school_recipient_read_idx" ON "notifications" USING btree ("school_id","recipient_user_id","read_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_school_created_at_idx" ON "notifications" USING btree ("school_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_school_type_idx" ON "notifications" USING btree ("school_id","notification_type");