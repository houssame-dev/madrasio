-- Task 047: application ACLs only. Audited hosted object creator: postgres.
-- No Auth/platform object is changed. rls_auto_enable is Supabase infrastructure.
DO $hardening$
DECLARE
  application_tables text[] := ARRAY['academic_periods', 'academic_years', 'announcement_publications', 'announcement_targets', 'announcement_versions', 'announcements', 'annual_results', 'assessments', 'attendance_records', 'classes', 'curricula', 'curriculum_subjects', 'curriculum_versions', 'gradebooks', 'grades', 'grading_configuration_versions', 'grading_configurations', 'homework', 'homework_submissions', 'homework_targets', 'levels', 'notifications', 'outbox_events', 'parent_students', 'parents', 'period_results', 'publication_recipient_snapshots', 'result_publications', 'school_memberships', 'schools', 'stages', 'student_enrollments', 'students', 'subject_results', 'subjects', 'teacher_assignments', 'teachers', 'tracks', 'users'];
  object_name text;
  grantee_name text;
  application_owner text;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO application_owner
    FROM pg_class WHERE oid = 'public.users'::regclass;
  IF application_owner <> 'postgres' OR current_user <> application_owner THEN
    RAISE EXCEPTION 'Application object owner requires security review';
  END IF;
  FOREACH object_name IN ARRAY application_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = object_name
        AND c.relkind = 'r' AND pg_get_userbyid(c.relowner) = application_owner
    ) THEN
      RAISE EXCEPTION 'Application table inventory/ownership requires security review';
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', object_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', object_name);
    FOR grantee_name IN
      SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', object_name, grantee_name);
    END LOOP;
  END LOOP;

  -- No application sequence or function exists in 0000-0014. Never blanket
  -- revoke ON ALL FUNCTIONS IN SCHEMA public: Supabase owns rls_auto_enable.
  -- Fail closed if an application sequence was introduced outside this chain.
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
      AND pg_get_userbyid(c.relowner) = application_owner
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'e')
  ) THEN
    RAISE EXCEPTION 'Unexpected application sequence requires security review';
  END IF;

  -- Scope per-schema defaults to the actual creator, never supabase_admin or
  -- auth/storage/cron/net/vault. Missing API roles are valid in plain local PG;
  -- hosted verification separately requires all three platform roles.
  FOR grantee_name IN
    SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I', application_owner, grantee_name);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', application_owner, grantee_name);
  END LOOP;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
  -- Preserve ALL function defaults: postgres also creates managed platform
  -- functions outside application ownership. Every future application-function
  -- migration MUST revoke unintended PUBLIC/anon/authenticated/service_role
  -- EXECUTE on the exact function signature in that SAME migration.
  -- The deployment security verifier rejects an exposed application function.
END
$hardening$;
