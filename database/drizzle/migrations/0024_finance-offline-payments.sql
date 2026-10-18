CREATE TABLE IF NOT EXISTS "finance_payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"fee_name" text NOT NULL,
	"period" text NOT NULL,
	"due_date" date NOT NULL,
	CONSTRAINT "finance_allocations_charge_unique" UNIQUE("payment_id","charge_id"),
	CONSTRAINT "finance_allocations_amount_check" CHECK ("finance_payment_allocations"."amount_cents" between 1 and 999999999)
);
--> statement-breakpoint
ALTER TABLE "finance_payment_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"receipt_reference" text NOT NULL,
	"school_name" text NOT NULL,
	"school_timezone" text NOT NULL,
	"student_name" text NOT NULL,
	"method" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'MAD' NOT NULL,
	"received_on" date NOT NULL,
	"reference" text,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_payments_student_context_unique" UNIQUE("school_id","student_id","id"),
	CONSTRAINT "finance_payments_request_unique" UNIQUE("school_id","request_key"),
	CONSTRAINT "finance_payments_receipt_unique" UNIQUE("school_id","receipt_reference"),
	CONSTRAINT "finance_payments_values_check" CHECK ("finance_payments"."currency"='MAD' and "finance_payments"."amount_cents" between 1 and 999999999 and "finance_payments"."method" in ('CASH','BANK_TRANSFER','CHEQUE') and ("finance_payments"."reference" is null or length("finance_payments"."reference") between 1 and 100))
);
--> statement-breakpoint
ALTER TABLE "finance_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance_payment_reversals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"reversal_reference" text NOT NULL,
	"reason" text NOT NULL,
	"reversed_by" uuid NOT NULL,
	"reversed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_reversals_payment_unique" UNIQUE("payment_id"),
	CONSTRAINT "finance_reversals_request_unique" UNIQUE("school_id","request_key"),
	CONSTRAINT "finance_reversals_reference_unique" UNIQUE("school_id","reversal_reference"),
	CONSTRAINT "finance_reversals_reason_check" CHECK (length(btrim("finance_payment_reversals"."reason")) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "finance_payment_reversals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "finance_student_charges" ADD CONSTRAINT "finance_charges_student_context_unique" UNIQUE("school_id","student_id","id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_payment_allocations" ADD CONSTRAINT "finance_allocations_payment_fk" FOREIGN KEY ("school_id","student_id","payment_id") REFERENCES "public"."finance_payments"("school_id","student_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_payment_allocations" ADD CONSTRAINT "finance_allocations_charge_fk" FOREIGN KEY ("school_id","student_id","charge_id") REFERENCES "public"."finance_student_charges"("school_id","student_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "public"."students"("school_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_actor_fk" FOREIGN KEY ("school_id","recorded_by") REFERENCES "public"."school_memberships"("school_id","user_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_payment_reversals" ADD CONSTRAINT "finance_reversals_payment_fk" FOREIGN KEY ("school_id","student_id","payment_id") REFERENCES "public"."finance_payments"("school_id","student_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_payment_reversals" ADD CONSTRAINT "finance_reversals_actor_fk" FOREIGN KEY ("school_id","reversed_by") REFERENCES "public"."school_memberships"("school_id","user_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_allocations_charge_idx" ON "finance_payment_allocations" USING btree ("school_id","charge_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_payments_student_date_idx" ON "finance_payments" USING btree ("school_id","student_id","received_on","id");--> statement-breakpoint

REVOKE ALL ON TABLE public.finance_payments,public.finance_payment_allocations,public.finance_payment_reversals FROM PUBLIC;
--> statement-breakpoint
DO $finance_acl$ DECLARE api_role text; table_name text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    FOREACH table_name IN ARRAY ARRAY['finance_payments','finance_payment_allocations','finance_payment_reversals'] LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',table_name,api_role);
    END LOOP;
  END LOOP;
END $finance_acl$;
