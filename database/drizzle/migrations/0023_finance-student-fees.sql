CREATE TABLE IF NOT EXISTS "finance_fee_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"fee_type_id" uuid NOT NULL,
	"level_id" uuid,
	"cadence" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"periods" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_structures_context_unique" UNIQUE("school_id","academic_year_id","fee_type_id","id"),
	CONSTRAINT "finance_structures_school_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "finance_structures_values_check" CHECK ("finance_fee_structures"."currency"='MAD' and "finance_fee_structures"."cadence" in ('MONTHLY','ONCE') and "finance_fee_structures"."amount_cents" between 1 and 999999999 and "finance_fee_structures"."revision">0 and jsonb_typeof("finance_fee_structures"."periods")='array' and jsonb_array_length("finance_fee_structures"."periods") between 1 and 36)
);
--> statement-breakpoint
ALTER TABLE "finance_fee_structures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance_fee_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_fee_types_school_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "finance_fee_types_name_check" CHECK (length(btrim("finance_fee_types"."name")) between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "finance_fee_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance_generation_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_batches_school_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "finance_batches_request_unique" UNIQUE("school_id","request_key")
);
--> statement-breakpoint
ALTER TABLE "finance_generation_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance_charge_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"before_cents" integer NOT NULL,
	"after_cents" integer NOT NULL,
	"actor_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_events_request_unique" UNIQUE("school_id","request_key"),
	CONSTRAINT "finance_events_values_check" CHECK ("finance_charge_events"."kind" in ('REDUCTION','CANCELLATION') and length(btrim("finance_charge_events"."reason")) between 1 and 500 and "finance_charge_events"."before_cents">="finance_charge_events"."after_cents" and "finance_charge_events"."after_cents">=0)
);
--> statement-breakpoint
ALTER TABLE "finance_charge_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance_student_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"fee_type_id" uuid NOT NULL,
	"structure_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"fee_name" text NOT NULL,
	"structure_revision" integer NOT NULL,
	"period" text NOT NULL,
	"due_date" date NOT NULL,
	"original_cents" integer NOT NULL,
	"reduction_cents" integer DEFAULT 0 NOT NULL,
	"allocated_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_charges_school_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "finance_charges_logical_identity_unique" UNIQUE("school_id","student_id","academic_year_id","fee_type_id","period"),
	CONSTRAINT "finance_charges_money_check" CHECK ("finance_student_charges"."currency"='MAD' and "finance_student_charges"."original_cents" between 1 and 999999999 and "finance_student_charges"."reduction_cents">=0 and "finance_student_charges"."reduction_cents"<="finance_student_charges"."original_cents" and "finance_student_charges"."allocated_cents">=0 and "finance_student_charges"."allocated_cents"<="finance_student_charges"."original_cents"-"finance_student_charges"."reduction_cents"),
	CONSTRAINT "finance_charges_state_check" CHECK ("finance_student_charges"."status" in ('OPEN','CANCELLED') and ("finance_student_charges"."status"<>'CANCELLED' or "finance_student_charges"."allocated_cents"=0)),
	CONSTRAINT "finance_charges_period_check" CHECK ("finance_student_charges"."period"='once' or "finance_student_charges"."period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "finance_student_charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_fee_structures" ADD CONSTRAINT "finance_structures_year_fk" FOREIGN KEY ("school_id","academic_year_id") REFERENCES "public"."academic_years"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_fee_structures" ADD CONSTRAINT "finance_structures_type_fk" FOREIGN KEY ("school_id","fee_type_id") REFERENCES "public"."finance_fee_types"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_fee_structures" ADD CONSTRAINT "finance_structures_level_fk" FOREIGN KEY ("school_id","level_id") REFERENCES "public"."levels"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_fee_structures" ADD CONSTRAINT "finance_structures_creator_fk" FOREIGN KEY ("school_id","created_by") REFERENCES "public"."school_memberships"("school_id","user_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_fee_structures" ADD CONSTRAINT "finance_structures_editor_fk" FOREIGN KEY ("school_id","updated_by") REFERENCES "public"."school_memberships"("school_id","user_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_fee_types" ADD CONSTRAINT "finance_fee_types_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_generation_batches" ADD CONSTRAINT "finance_generation_batches_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_generation_batches" ADD CONSTRAINT "finance_batches_actor_fk" FOREIGN KEY ("school_id","created_by") REFERENCES "public"."school_memberships"("school_id","user_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_charge_events" ADD CONSTRAINT "finance_events_charge_fk" FOREIGN KEY ("school_id","charge_id") REFERENCES "public"."finance_student_charges"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_charge_events" ADD CONSTRAINT "finance_events_actor_fk" FOREIGN KEY ("school_id","actor_id") REFERENCES "public"."school_memberships"("school_id","user_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_student_charges" ADD CONSTRAINT "finance_charges_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "public"."students"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_student_charges" ADD CONSTRAINT "finance_charges_class_fk" FOREIGN KEY ("school_id","academic_year_id","class_id") REFERENCES "public"."classes"("school_id","academic_year_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_student_charges" ADD CONSTRAINT "finance_charges_structure_fk" FOREIGN KEY ("school_id","academic_year_id","fee_type_id","structure_id") REFERENCES "public"."finance_fee_structures"("school_id","academic_year_id","fee_type_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_student_charges" ADD CONSTRAINT "finance_charges_batch_fk" FOREIGN KEY ("school_id","batch_id") REFERENCES "public"."finance_generation_batches"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_structures_active_scope_unique" ON "finance_fee_structures" USING btree ("school_id","academic_year_id","fee_type_id",coalesce("level_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "finance_fee_structures"."active";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_fee_types_name_unique" ON "finance_fee_types" USING btree ("school_id",lower("name"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_events_charge_idx" ON "finance_charge_events" USING btree ("school_id","charge_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_charges_school_year_due_idx" ON "finance_student_charges" USING btree ("school_id","academic_year_id","due_date","id");
--> statement-breakpoint
-- Application ACL boundary: only the five new Finance tables, no managed objects.
REVOKE ALL ON TABLE public.finance_fee_types, public.finance_fee_structures, public.finance_generation_batches, public.finance_student_charges, public.finance_charge_events FROM PUBLIC;
--> statement-breakpoint
DO $finance_acl$
DECLARE api_role text; table_name text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    FOREACH table_name IN ARRAY ARRAY['finance_fee_types','finance_fee_structures','finance_generation_batches','finance_student_charges','finance_charge_events'] LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',table_name,api_role);
    END LOOP;
  END LOOP;
END
$finance_acl$;