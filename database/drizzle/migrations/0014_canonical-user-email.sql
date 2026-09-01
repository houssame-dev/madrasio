ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint

UPDATE "users" AS "application_user"
SET "email" = lower(btrim("auth_user"."email"))
FROM "auth"."users" AS "auth_user"
WHERE "application_user"."id" = "auth_user"."id"
  AND "auth_user"."email" IS NOT NULL
  AND length(btrim("auth_user"."email")) > 0;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "email" IS NULL) THEN
    RAISE EXCEPTION 'Cannot reconcile public.users email projection: missing Auth identity or non-usable Auth email';
  END IF;

  IF EXISTS (
    SELECT "email"
    FROM "users"
    GROUP BY "email"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot reconcile public.users email projection: duplicate normalized Auth email';
  END IF;
END
$$;--> statement-breakpoint

ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_canonical_check" CHECK ("users"."email" = lower(btrim("users"."email")) and length("users"."email") > 0);
