ALTER TABLE "finance_charge_events" DROP CONSTRAINT "finance_events_values_check";
--> statement-breakpoint
ALTER TABLE "finance_charge_events" ADD COLUMN "reduction_id" uuid;
--> statement-breakpoint
ALTER TABLE "finance_charge_events" ADD COLUMN "replaces_event_id" uuid;
--> statement-breakpoint
ALTER TABLE "finance_charge_events" ADD COLUMN "reduction_before_cents" integer;
--> statement-breakpoint
ALTER TABLE "finance_charge_events" ADD COLUMN "reduction_after_cents" integer;
--> statement-breakpoint
ALTER TABLE "finance_charge_events" ADD CONSTRAINT "finance_events_context_unique" UNIQUE("school_id","charge_id","id");
--> statement-breakpoint
ALTER TABLE "finance_charge_events" ADD CONSTRAINT "finance_events_replaces_unique" UNIQUE("school_id","replaces_event_id");
--> statement-breakpoint
ALTER TABLE "finance_charge_events" ADD CONSTRAINT "finance_events_values_check" CHECK (length(btrim("finance_charge_events"."reason")) between 1 and 500 and "finance_charge_events"."before_cents">=0 and "finance_charge_events"."after_cents">=0 and (
    ("finance_charge_events"."kind" in ('REDUCTION','CANCELLATION') and "finance_charge_events"."before_cents">="finance_charge_events"."after_cents" and "finance_charge_events"."reduction_id" is null and "finance_charge_events"."replaces_event_id" is null and "finance_charge_events"."reduction_before_cents" is null and "finance_charge_events"."reduction_after_cents" is null)
    or ("finance_charge_events"."kind" in ('REDUCTION_EDIT','REDUCTION_CANCEL') and "finance_charge_events"."reduction_id" is not null and "finance_charge_events"."replaces_event_id" is not null and "finance_charge_events"."reduction_id"<>"finance_charge_events"."id" and "finance_charge_events"."replaces_event_id"<>"finance_charge_events"."id"
      and "finance_charge_events"."reduction_before_cents" is not null and "finance_charge_events"."reduction_after_cents" is not null and "finance_charge_events"."reduction_before_cents" between 1 and 999999999
      and (("finance_charge_events"."kind"='REDUCTION_EDIT' and "finance_charge_events"."reduction_after_cents" between 1 and 999999999) or ("finance_charge_events"."kind"='REDUCTION_CANCEL' and "finance_charge_events"."reduction_after_cents"=0))
      and "finance_charge_events"."after_cents"="finance_charge_events"."before_cents"+"finance_charge_events"."reduction_before_cents"-"finance_charge_events"."reduction_after_cents")));
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_charge_events" ADD CONSTRAINT "finance_events_reduction_fk" FOREIGN KEY ("school_id","charge_id","reduction_id") REFERENCES "public"."finance_charge_events"("school_id","charge_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finance_charge_events" ADD CONSTRAINT "finance_events_previous_fk" FOREIGN KEY ("school_id","charge_id","replaces_event_id") REFERENCES "public"."finance_charge_events"("school_id","charge_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
