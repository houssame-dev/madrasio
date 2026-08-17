CREATE TYPE "public"."grading_configuration_status" AS ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."grading_configuration_version_status" AS ENUM('DRAFT', 'ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grading_configuration_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"grading_configuration_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" "grading_configuration_version_status" DEFAULT 'DRAFT' NOT NULL,
	"rules" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grading_configuration_versions_school_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "grading_configuration_versions_number_check" CHECK ("grading_configuration_versions"."version_number" > 0),
	CONSTRAINT "grading_configuration_versions_rules_object_check" CHECK (jsonb_typeof("grading_configuration_versions"."rules") = 'object')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grading_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "grading_configuration_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grading_configurations_school_id_unique" UNIQUE("school_id","id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grading_configuration_versions" ADD CONSTRAINT "grading_configuration_versions_school_config_fk" FOREIGN KEY ("school_id","grading_configuration_id") REFERENCES "public"."grading_configurations"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grading_configurations" ADD CONSTRAINT "grading_configurations_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "grading_configuration_versions_config_number_unique" ON "grading_configuration_versions" USING btree ("grading_configuration_id","version_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grading_configuration_versions_school_config_idx" ON "grading_configuration_versions" USING btree ("school_id","grading_configuration_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grading_configuration_versions_config_status_idx" ON "grading_configuration_versions" USING btree ("grading_configuration_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "grading_configurations_school_name_unique" ON "grading_configurations" USING btree ("school_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grading_configurations_school_status_idx" ON "grading_configurations" USING btree ("school_id","status");