ALTER TABLE "finance_fee_structures" DROP CONSTRAINT "finance_structures_values_check";
--> statement-breakpoint
ALTER TABLE "finance_payments" DROP CONSTRAINT "finance_payments_values_check";
--> statement-breakpoint
ALTER TABLE "finance_student_charges" DROP CONSTRAINT "finance_charges_money_check";
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "finance_currency" text DEFAULT 'MAD' NOT NULL;
--> statement-breakpoint
ALTER TABLE "finance_payment_allocations" ADD COLUMN "currency" text DEFAULT 'MAD' NOT NULL;
--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_finance_currency_unique" UNIQUE("id","finance_currency");
--> statement-breakpoint
ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_currency_context_unique" UNIQUE("school_id","student_id","id","currency");
--> statement-breakpoint
ALTER TABLE "finance_student_charges" ADD CONSTRAINT "finance_charges_currency_context_unique" UNIQUE("school_id","student_id","id","currency");
--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_finance_currency_check" CHECK ("schools"."finance_currency" in ('MAD','EUR','USD','GBP'));
--> statement-breakpoint
ALTER TABLE "finance_fee_structures" ADD CONSTRAINT "finance_structures_values_check" CHECK ("finance_fee_structures"."currency" in ('MAD','EUR','USD','GBP') and "finance_fee_structures"."cadence" in ('MONTHLY','ONCE') and "finance_fee_structures"."amount_cents" between 1 and 999999999 and "finance_fee_structures"."revision">0 and jsonb_typeof("finance_fee_structures"."periods")='array' and jsonb_array_length("finance_fee_structures"."periods") between 1 and 36);
--> statement-breakpoint
ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_values_check" CHECK ("finance_payments"."currency" in ('MAD','EUR','USD','GBP') and "finance_payments"."amount_cents" between 1 and 999999999 and "finance_payments"."method" in ('CASH','BANK_TRANSFER','CHEQUE') and ("finance_payments"."reference" is null or length("finance_payments"."reference") between 1 and 100));
--> statement-breakpoint
ALTER TABLE "finance_student_charges" ADD CONSTRAINT "finance_charges_money_check" CHECK ("finance_student_charges"."currency" in ('MAD','EUR','USD','GBP') and "finance_student_charges"."original_cents" between 1 and 999999999 and "finance_student_charges"."reduction_cents">=0 and "finance_student_charges"."reduction_cents"<="finance_student_charges"."original_cents" and "finance_student_charges"."allocated_cents">=0 and "finance_student_charges"."allocated_cents"<="finance_student_charges"."original_cents"-"finance_student_charges"."reduction_cents");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_fee_structures" ADD CONSTRAINT "finance_structures_currency_fk" FOREIGN KEY ("school_id","currency") REFERENCES "public"."schools"("id","finance_currency") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_payment_allocations" ADD CONSTRAINT "finance_allocations_payment_currency_fk" FOREIGN KEY ("school_id","student_id","payment_id","currency") REFERENCES "public"."finance_payments"("school_id","student_id","id","currency") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_payment_allocations" ADD CONSTRAINT "finance_allocations_charge_currency_fk" FOREIGN KEY ("school_id","student_id","charge_id","currency") REFERENCES "public"."finance_student_charges"("school_id","student_id","id","currency") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_payments" ADD CONSTRAINT "finance_payments_currency_fk" FOREIGN KEY ("school_id","currency") REFERENCES "public"."schools"("id","finance_currency") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_student_charges" ADD CONSTRAINT "finance_charges_currency_fk" FOREIGN KEY ("school_id","currency") REFERENCES "public"."schools"("id","finance_currency") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
